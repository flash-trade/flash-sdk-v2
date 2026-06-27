import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, TransactionInstruction, Keypair } from "@solana/web3.js";
import type { Ctx } from "../_lib";
import {
  note,
  phase,
  ok,
  logSent,
  sendBase,
  sendEr,
  pollVisibleOnEr,
} from "../_lib";
import type { LockRequestStatus, InstructionResult } from "@flash_trade/flash-sdk-v2";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Shared helpers for the FAF token-stake (governance staking) runner scripts.
//
// The FAF mint, vault and vault token account all live on the PoolConfig
// (`tokenMint` / `tokenVault` / `tokenVaultTokenAccount`). The staking-token
// program is plain SPL by default; set TOKEN22=1 if the FAF mint is Token-2022.
// ---------------------------------------------------------------------------

/** The FAF token may be a Token-2022 mint — override per cluster with TOKEN22=1. */
export const TOKEN22 = process.env.TOKEN22 === "1";

/** Token program the FAF mint is owned by (plain SPL unless TOKEN22=1). */
export const fafTokenProgram = (): PublicKey =>
  TOKEN22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

/** The FAF / governance staking-token mint, straight off the pool config. */
export const fafMint = (ctx: Ctx): PublicKey => ctx.poolConfig.tokenMint;

/** Owner's FAF associated token account + an idempotent create ix (a no-op if it
 *  already exists). Prepend `createIx` to a base tx so the receiving / funding
 *  account is guaranteed to exist before the transfer. */
export function ownerFafAta(
  ctx: Ctx,
  owner: PublicKey = ctx.wallet.publicKey,
): { ata: PublicKey; createIx: TransactionInstruction; mint: PublicKey } {
  const mint = fafMint(ctx);
  const programId = fafTokenProgram();
  const ata = getAssociatedTokenAddressSync(mint, owner, true, programId);
  const createIx = createAssociatedTokenAccountIdempotentInstruction(
    owner,
    ata,
    owner,
    mint,
    programId,
  );
  return { ata, createIx, mint };
}

/** Owner's ATA of an ARBITRARY mint + an idempotent create ix. Used for the
 *  revenue / rebate payout mints (USDC etc.), which aren't the FAF mint. */
export function ownerAta(
  ctx: Ctx,
  mint: PublicKey,
  token22: boolean,
  owner: PublicKey = ctx.wallet.publicKey,
): { ata: PublicKey; createIx: TransactionInstruction } {
  const programId = token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const ata = getAssociatedTokenAddressSync(mint, owner, true, programId);
  const createIx = createAssociatedTokenAccountIdempotentInstruction(
    owner,
    ata,
    owner,
    mint,
    programId,
  );
  return { ata, createIx };
}

/** Resolve a token account's mint + token program by reading it on-chain. Used to
 *  discover the revenue / rebate payout mint from the vault token account that the
 *  pool config points at (`revenueTokenAccount` / `rebateTokenAccount`). */
export async function readTokenAccountMint(
  ctx: Ctx,
  tokenAccount: PublicKey,
): Promise<{ mint: PublicKey; token22: boolean }> {
  const info = await ctx.client.provider.connection.getParsedAccountInfo(
    tokenAccount,
  );
  const v = info.value;
  if (!v || !("parsed" in (v.data as any)))
    throw new Error(`not a parseable token account: ${tokenAccount.toBase58()}`);
  const mint = new PublicKey((v.data as any).parsed.info.mint);
  return { mint, token22: v.owner.equals(TOKEN_2022_PROGRAM_ID) };
}

/** Drive an auto-`_er` token flow (deposit / withdraw / collect-*). The base
 *  `*_with_action` tx delegates the receipt AND queues `_er` as an auto-run
 *  post-delegation action, so the happy path is just: send base → poll the
 *  receipt closed. `RESUME=1` is the recovery path: skip the base tx and drive
 *  `_er` manually for a receipt the auto-action left stuck on the ER. */
export async function driveAutoErFlow(
  ctx: Ctx,
  args: {
    /** Human label + log prefix, e.g. "collect_token_reward". */
    label: string;
    /** The delegated receipt PDA whose close marks the flow done. */
    receipt: PublicKey;
    /** Instructions to prepend to the base tx (e.g. an idempotent ATA create). */
    prependIxs?: TransactionInstruction[];
    /** Build the base `*_with_action` tx. */
    buildBase: () => Promise<InstructionResult>;
    /** Build the recovery `*_er` tx (RESUME only), paid by `payer`. */
    buildEr: (payer: PublicKey) => Promise<InstructionResult>;
  },
): Promise<Record<string, unknown>> {
  const isResume = process.env.RESUME === "1";
  const out: Record<string, unknown> = {
    flow: args.label,
    receipt: args.receipt.toBase58(),
    resume: isResume,
  };

  if (!isResume) {
    phase(`base ${args.label}: delegate receipt (auto-queues _er → settle)`);
    note(`receipt=${args.receipt.toBase58()}`);
    const res = await args.buildBase();
    if (args.prependIxs?.length) res.instructions.unshift(...args.prependIxs);
    const sent = logSent(await sendBase(ctx, res));
    out.phase1 = sent;
    if (!("signature" in sent)) return out; // dry-run: stop here
  } else {
    phase(`RESUME — poll the stuck ${args.label} receipt onto the ER (≤30s)`);
    await pollVisibleOnEr(ctx, args.receipt);
    ok("receipt visible on ER");
    const erPayer = Keypair.generate();
    phase(`ER commit: ${args.label}_er (ephemeral payer)`);
    note(`payer=${erPayer.publicKey.toBase58()}`);
    out.resumeEr = logSent(
      await sendEr(ctx, await args.buildEr(erPayer.publicKey), [erPayer]),
    );
  }

  phase(`poll: wait for base-layer settle to close the ${args.label} receipt (≤90s)`);
  await pollReceiptSettled(ctx, args.receipt);
  ok(`${args.label} receipt settled + closed on base`);
  out.settled = true;
  return out;
}

/** Read the live (delegated → ER) token_stake and return its per-request lock
 *  statuses. Falls back to the base copy, then to `[]` if the account is missing
 *  (never staked). Reads the ER copy first because the account is delegated there
 *  once staked, and the matured `withdrawableAmount` only updates ER-side. */
export async function readLockStatuses(
  ctx: Ctx,
  owner: PublicKey = ctx.wallet.publicKey,
): Promise<LockRequestStatus[]> {
  const fetchers = [ctx.client.erAccounts, ctx.client.accounts].filter(Boolean);
  for (const f of fetchers) {
    try {
      const stake = await f!.fetchTokenStake(owner);
      return stake.getLockStatus();
    } catch {
      /* try the next fetcher */
    }
  }
  return [];
}

/** Poll the base chain until a receipt is closed (gone). The token `_with_action`
 *  base tx CREATES the receipt and queues `_er` as an auto-run post-delegation
 *  action, so once the base tx is confirmed the receipt definitely existed —
 *  therefore a `null` / zero-lamport read means the auto `_er` → settle has
 *  already closed it (no separate "seen-then-gone" tracking needed, unlike the
 *  LP driver). */
export async function pollReceiptSettled(
  ctx: Ctx,
  receipt: PublicKey,
  timeoutMs = 90_000,
): Promise<void> {
  const conn = ctx.client.provider.connection;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await conn.getAccountInfo(receipt).catch(() => null);
    if (info === null || info.lamports === 0) return; // settled + closed
    await sleep(3_000);
  }
  throw new Error(
    `Timeout: receipt ${receipt.toBase58()} still open after ${timeoutMs}ms ` +
      `(auto _er→settle did not run — retry with RESUME=1 to drive _er manually)`,
  );
}

/** Pick the withdraw_request index to settle. Honours WITHDRAW_REQUEST_ID when
 *  set; otherwise the first request with a non-zero matured `withdrawableAmount`,
 *  else request 0. Logs the lock table so the chosen id is auditable. */
export function pickWithdrawRequestId(statuses: LockRequestStatus[]): number {
  if (process.env.WITHDRAW_REQUEST_ID !== undefined)
    return Number(process.env.WITHDRAW_REQUEST_ID);

  if (statuses.length === 0) {
    note("no withdraw requests on token_stake — defaulting id=0 (will pay 0)");
    return 0;
  }
  for (const s of statuses)
    note(
      `req#${s.requestId}: locked=${s.lockedAmount.toString()} ` +
        `withdrawable=${s.withdrawableAmount.toString()} ` +
        `timeRemaining=${s.timeRemaining.toString()}s`,
    );
  const matured = statuses.find((s) => !s.withdrawableAmount.isZero());
  if (matured) {
    note(`→ chosen matured request id=${matured.requestId}`);
    return matured.requestId;
  }
  note("→ no matured request yet — using id=0 (settle will pay 0)");
  return 0;
}
