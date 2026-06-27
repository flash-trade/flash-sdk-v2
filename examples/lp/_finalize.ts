import { PublicKey } from "@solana/web3.js";
import { Ctx, sendBase, logSent, phase, note, ok } from "../_lib";

// ---------------------------------------------------------------------------
// Shared terminal-close logic for the LP / migrate ER flows.
//
// After the `_er` commit runs it sets `receipt.processed = 1` and queues the
// unified settle action as a post-undelegate action that normally closes the
// receipt automatically. But that action can fail, leaving the receipt
// undelegated + processed + open. Re-driving `_er` then fails
// `ReceiptAlreadyProcessed` (6076).
//
// `finalizeReceipt` makes every script self-healing + state-aware:
//   1. wait briefly for the ER-queued action to auto-close the receipt;
//   2. if it's still open + processed, read the receipt's decision field for
//      logging and drive settle DIRECTLY on the base chain to close it.
// The decision field per flow is the value the `_er` slippage branch wrote:
//   add/removeCompounding · add/removeLiquidity · migrateFlp — see each caller.
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FinalizeCfg {
  /** Receipt PDA being closed. */
  receipt: PublicKey;
  /** Anchor account namespace to fetch the receipt, e.g. "stakingWithdrawReceipt". */
  accountNamespace: string;
  /** Primary u64 field that reports success(>0) vs failure(==0), camelCase. */
  decisionField: string;
  /** Optional second field OR-ed into the success test (add-compounding). */
  altDecisionField?: string;
  /** Build the base-layer settle ix(s). */
  settle: () => Promise<{ instructions: any[]; additionalSigners?: any[] }>;
  /** How long to wait for the ER-queued auto-action before closing manually. */
  autoCloseWaitMs?: number;
}

const DELEGATION_PROGRAM = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";

/** Where a receipt is in its lifecycle — drives the resume routing. */
export type ReceiptState =
  | "absent" // never created, or already closed → nothing to do
  | "delegated" // on the ER (or delegated base stub) → `_er` still needs to run
  | "open-unprocessed" // back on base but processed==0 (shouldn't normally happen)
  | "processed"; // back on base, processed==1 → settle to close

/** Classify a receipt so a resume can decide between driving `_er` and closing. */
export async function receiptState(
  ctx: Ctx,
  receipt: PublicKey,
  accountNamespace: string,
): Promise<ReceiptState> {
  const base = await ctx.client.provider.connection
    .getAccountInfo(receipt)
    .catch(() => null);
  const er = ctx.client.erConnection
    ? await ctx.client.erConnection.getAccountInfo(receipt).catch(() => null)
    : null;
  const baseLive = !!base && base.lamports > 0;
  const erLive = !!er && er.lamports > 0;
  if (!baseLive && !erLive) return "absent";
  if (baseLive && base!.owner.toBase58() !== DELEGATION_PROGRAM) {
    const acc: any = await (ctx.client.program.account as any)[accountNamespace].fetch(
      receipt,
    );
    return Number(acc.processed) === 1 ? "processed" : "open-unprocessed";
  }
  return "delegated"; // delegated base stub and/or live on the ER
}

/** Big-ish field read helper — anchor returns BN for u64; coerce to bigint. */
function toBig(v: any): bigint {
  if (v == null) return 0n;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  return BigInt(v.toString());
}

/**
 * Drive a processed receipt to a closed state. Returns a summary describing
 * which terminal path ran (auto / settle / none).
 */
export async function finalizeReceipt(
  ctx: Ctx,
  cfg: FinalizeCfg,
): Promise<Record<string, unknown>> {
  const conn = ctx.client.provider.connection;
  const out: Record<string, unknown> = { receipt: cfg.receipt.toBase58() };
  const wait = cfg.autoCloseWaitMs ?? 30_000;

  // ── 1. wait for the ER-queued action to auto-close, OR for the receipt to
  //       land back on base undelegated (owner = perpetuals) so we can close it.
  phase("finalize: wait for settle to close the receipt");
  const deadline = Date.now() + wait;
  let onBaseUndelegated = false;
  while (Date.now() < deadline) {
    const info = await conn.getAccountInfo(cfg.receipt).catch(() => null);
    if (!info || info.lamports === 0) {
      ok("receipt closed by the ER-queued action (auto)");
      out.action = "auto";
      out.closed = true;
      return out;
    }
    if (info.owner.toBase58() !== DELEGATION_PROGRAM) {
      // Undelegated and owned by the program again → _er ran; close it ourselves.
      onBaseUndelegated = true;
      break;
    }
    await sleep(3_000);
  }

  if (!onBaseUndelegated) {
    // Still delegated/pending on the ER after the wait — not ours to close yet.
    note("receipt still delegated/pending on ER — auto-action hasn't run; retry later");
    out.action = "pending";
    out.closed = false;
    return out;
  }

  // ── 2. read the receipt and drive the single settle finalizer.
  const acc: any = await (ctx.client.program.account as any)[cfg.accountNamespace].fetch(
    cfg.receipt,
  );
  const processed = Number(acc.processed) === 1;
  const primary = toBig(acc[cfg.decisionField]);
  const alt = cfg.altDecisionField ? toBig(acc[cfg.altDecisionField]) : 0n;
  note(
    `processed=${processed} ${cfg.decisionField}=${primary.toString()}` +
      (cfg.altDecisionField ? ` ${cfg.altDecisionField}=${alt.toString()}` : ""),
  );

  if (!processed) {
    // _er hasn't committed (shouldn't happen on the undelegated path) — bail.
    note("receipt undelegated but not processed — driving _er is the caller's job");
    out.action = "needs-er";
    out.closed = false;
    return out;
  }

  const success = primary > 0n || alt > 0n;
  phase(`close: settle (${success ? "success branch" : "failure branch"})`);
  const res = await cfg.settle();
  const sent = logSent(await sendBase(ctx, res));
  out.action = "settle";
  out.outcome = success ? "success" : "failure";
  out.close = sent;
  if (!("signature" in (sent as any))) {
    out.closed = false;
    return out; // dry-run
  }

  // ── 3. the close tx already confirmed (sendBase waits) — verify it's gone.
  const still = await conn.getAccountInfo(cfg.receipt).catch(() => null);
  if (still?.lamports) throw new Error("close tx confirmed but receipt still present");
  ok("receipt closed on base");
  out.closed = true;
  return out;
}
