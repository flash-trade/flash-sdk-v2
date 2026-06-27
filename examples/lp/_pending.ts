import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Ctx, sendEr, pollVisibleOnEr, format } from "../_lib";
import {
  findCompDepositReceiptAddress,
  findCompWithdrawReceiptAddress,
  findStakingDepositReceiptAddress,
  findStakingWithdrawReceiptAddress,
  type CustodyConfig,
} from "@flash_trade/flash-sdk-v2";
import { finalizeReceipt, receiptState } from "./_finalize";

// ---------------------------------------------------------------------------
// Processor for ALREADY-PENDING LP liquidity receipts — covers BOTH the
// compounding (sFLP) and staked-LP (FLP) flows:
//   • "deposit"        — add_compounding_liquidity  (sFLP mint)
//   • "withdraw"       — remove_compounding_liquidity (sFLP burn)
//   • "stake-deposit"  — add_liquidity_and_stake     (staked FLP)
//   • "staked-withdraw"— remove_liquidity (unstake + redeem)
//
// A pending receipt = a `*_with_action` base tx staged + delegated the receipt
// (with the `_er` action NOT yet run). Processing it = drive the queued `_er`
// commit + settle — the RESUME tail of the add/remove{Compounding}Liquidity and
// addLiquidityAndStake scripts. These create nothing; they only settle what's
// already pending. All four receipt kinds are owner+custody-mint scoped, so the
// per-token scan below works identically for each.
//
// WALLET-SCOPED (matches the UI): for the loaded wallet (or `OWNER`), we derive
// the receipt PDA per token and look it up directly, so we catch a receipt in
// EITHER location:
//   • "Base chain"       — base account owned by the delegation program
//                          (DELeGG…); delegated but not yet cloned to the ER.
//   • "Ephemeral Rollup" — present + active on the ER.
// Enumerating `*.all()` would miss the first (its base owner is the delegation
// program, not perpetuals) — which is exactly why an ER-only scan reported
// "none pending" for a receipt the UI showed as pending on the base chain.
//
// Flow per pending receipt (SEND=1):
//   1. poll the receipt onto the ER (the validator clones it on access)
//   2. ER `_er` commit, signed by a throwaway payer
//   3. poll the base chain until settle closes the receipt
// ---------------------------------------------------------------------------

const rewardSymbol = process.env.REWARD_SYMBOL || undefined; // default USDC

/** MagicBlock delegation program — owns the base stub of a delegated account. */
const DELEGATION_PROGRAM = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
);

export type PendingKind =
  | "deposit"
  | "withdraw"
  | "stake-deposit"
  | "staked-withdraw";

export interface PendingResult {
  kind: PendingKind;
  symbol: string;
  receipt: string;
  owner: string;
  location: "base-chain" | "ephemeral-rollup" | "none";
  pending: boolean;
  processed?: boolean; // did THIS run close it
  er?: unknown;
  finalize?: unknown; // settle close summary
  error?: string;
}

interface ReceiptCfg {
  kind: PendingKind;
  find: (owner: PublicKey, mint: PublicKey, pid: PublicKey) => [PublicKey, number];
  /** Anchor account namespace + decision field, for the state-aware close. */
  accountNamespace: string;
  decisionField: string;
  altDecisionField?: string;
  /** `_er` commit (only when the receipt isn't yet processed). */
  drive: (
    ctx: Ctx,
    owner: PublicKey,
    custody: CustodyConfig,
    payer: PublicKey,
  ) => Promise<{ instructions: any[] }>;
  /** Base-layer terminal close. The settle ix branches by the receipt fields. */
  settle: (
    ctx: Ctx,
    owner: PublicKey,
    custody: CustodyConfig,
  ) => Promise<{ instructions: any[]; additionalSigners?: any[] }>;
}

const DEPOSIT: ReceiptCfg = {
  kind: "deposit",
  find: findCompDepositReceiptAddress,
  accountNamespace: "compoundingDepositReceipt",
  decisionField: "userLpToMint",
  altDecisionField: "compoundingToMint",
  drive: (ctx, owner, custody, payer) =>
    ctx.client.addCompoundingLiquidityEr(ctx.poolConfig, {
      inSymbol: custody.symbol,
      fundingAccount: getAssociatedTokenAddressSync(custody.mintKey, owner, true),
      compoundingTokenAccount: getAssociatedTokenAddressSync(
        ctx.poolConfig.compoundingTokenMint,
        owner,
        true,
      ),
      payer,
      owner,
      rewardSymbol,
    }),
  settle: (ctx, owner, custody) =>
    ctx.client.addCompoundingLiquiditySettle(ctx.poolConfig, { symbol: custody.symbol, owner }),
};

const WITHDRAW: ReceiptCfg = {
  kind: "withdraw",
  find: findCompWithdrawReceiptAddress,
  accountNamespace: "compoundingWithdrawReceipt",
  decisionField: "outTokenAmount",
  drive: (ctx, owner, custody, payer) =>
    ctx.client.removeCompoundingLiquidityEr(ctx.poolConfig, {
      outSymbol: custody.symbol,
      receivingAccount: getAssociatedTokenAddressSync(custody.mintKey, owner, true),
      compoundingTokenAccount: getAssociatedTokenAddressSync(
        ctx.poolConfig.compoundingTokenMint,
        owner,
        true,
      ),
      payer,
      owner,
      rewardSymbol,
    }),
  settle: (ctx, owner, custody) =>
    ctx.client.removeCompoundingLiquiditySettle(ctx.poolConfig, { symbol: custody.symbol, owner }),
};

const STAKE_DEPOSIT: ReceiptCfg = {
  kind: "stake-deposit",
  find: findStakingDepositReceiptAddress,
  accountNamespace: "stakingDepositReceipt",
  decisionField: "lpTokensToMint",
  drive: (ctx, owner, custody, payer) =>
    ctx.client.addLiquidityAndStakeEr(ctx.poolConfig, {
      inSymbol: custody.symbol,
      fundingAccount: getAssociatedTokenAddressSync(custody.mintKey, owner, true),
      payer,
      owner,
    }),
  settle: (ctx, owner, custody) =>
    ctx.client.addLiquidityAndStakeSettle(ctx.poolConfig, { symbol: custody.symbol, owner }),
};

const STAKED_WITHDRAW: ReceiptCfg = {
  kind: "staked-withdraw",
  find: findStakingWithdrawReceiptAddress,
  accountNamespace: "stakingWithdrawReceipt",
  decisionField: "tokenAmountToWithdraw",
  drive: (ctx, owner, custody, payer) =>
    ctx.client.removeLiquidityEr(ctx.poolConfig, {
      outSymbol: custody.symbol,
      receivingAccount: getAssociatedTokenAddressSync(custody.mintKey, owner, true),
      payer,
      owner,
      rewardSymbol,
    }),
  settle: (ctx, owner, custody) =>
    ctx.client.removeLiquiditySettle(ctx.poolConfig, {
      outSymbol: custody.symbol,
      receivingAccount: getAssociatedTokenAddressSync(custody.mintKey, owner, true),
      owner,
    }),
};

const CFG: Record<PendingKind, ReceiptCfg> = {
  deposit: DEPOSIT,
  withdraw: WITHDRAW,
  "stake-deposit": STAKE_DEPOSIT,
  "staked-withdraw": STAKED_WITHDRAW,
};

/** Custodies to scan: a single token when SYMBOL is set, else every custody. */
function selectCustodies(ctx: Ctx): CustodyConfig[] {
  const symbol = process.env.SYMBOL;
  if (!symbol) return ctx.poolConfig.custodies;
  const token = ctx.poolConfig.getTokenFromSymbol(symbol);
  const custody = ctx.poolConfig.custodies.find((c) => c.mintKey.equals(token.mintKey));
  if (!custody) throw new Error(`no custody for ${symbol}`);
  return [custody];
}

/** Drive ONE pending receipt to a CLOSED state (no-op if it isn't pending).
 *  State-aware: a not-yet-processed receipt gets the `_er` commit; an
 *  already-processed receipt (the `_er` ran but the queued settle didn't
 *  close it) gets settle driven directly — re-running `_er`
 *  there would fail `ReceiptAlreadyProcessed` (6076). */
async function processOne(
  ctx: Ctx,
  cfg: ReceiptCfg,
  owner: PublicKey,
  custody: CustodyConfig,
): Promise<PendingResult> {
  const [receipt] = cfg.find(owner, custody.mintKey, ctx.client.programId);
  const state = await receiptState(ctx, receipt, cfg.accountNamespace);
  const location: PendingResult["location"] =
    state === "absent"
      ? "none"
      : state === "delegated"
        ? "ephemeral-rollup"
        : "base-chain";
  const r: PendingResult = {
    kind: cfg.kind,
    symbol: custody.symbol,
    receipt: receipt.toBase58(),
    owner: owner.toBase58(),
    location,
    pending: state !== "absent",
  };
  if (!r.pending) return r;

  console.log(
    `  • ${cfg.kind} ${custody.symbol} [${location}] state=${state} receipt=${r.receipt}`,
  );
  if (process.env.SEND !== "1") {
    console.log(`      (dry-run — set SEND=1 to settle)`);
    return r;
  }

  const finalizeCfg = {
    receipt,
    accountNamespace: cfg.accountNamespace,
    decisionField: cfg.decisionField,
    altDecisionField: cfg.altDecisionField,
    settle: () => cfg.settle(ctx, owner, custody),
  };

  try {
    if (state !== "processed") {
      // Not yet committed — run the `_er` commit first.
      console.log(`      [phase 2] waiting for receipt on ER (validator clones it)…`);
      await pollVisibleOnEr(ctx, receipt).catch((e) => {
        console.log(`      [phase 2] not visible yet (${e?.message ?? e}) — trying _er anyway`);
      });
      const erPayer = Keypair.generate();
      console.log(`      [phase 3] ER commit (payer=${erPayer.publicKey.toBase58()})…`);
      const erRes = await cfg.drive(ctx, owner, custody, erPayer.publicKey);
      r.er = await sendEr(ctx, erRes as any, [erPayer]);
      console.log(`      [phase 3] ✓`, JSON.stringify(format(r.er)));
    } else {
      console.log(`      [phase 3] receipt already processed — closing via settle`);
    }

    // [phase 4] settle closes the receipt (auto, else driven here).
    const fin = await finalizeReceipt(ctx, finalizeCfg);
    r.finalize = format(fin);
    r.processed = fin.closed === true;
  } catch (e: any) {
    r.error = e?.message ?? String(e);
    console.log(`      ! failed: ${r.error}`);
  }
  return r;
}

/** Process pending receipts of the given kinds (SYMBOL filter, OWNER override). */
export async function processPending(ctx: Ctx, kinds: PendingKind[]) {
  const owner = process.env.OWNER
    ? new PublicKey(process.env.OWNER)
    : ctx.wallet.publicKey;
  const custodies = selectCustodies(ctx);
  const send = process.env.SEND === "1";

  console.log(
    `scanning ${custodies.length} token(s) for pending ${kinds.join(" + ")} ` +
      `receipt(s)\nowner: ${owner.toBase58()}${owner.equals(ctx.wallet.publicKey) ? " (this wallet)" : ""}`,
  );
  console.log(`mode: ${send ? "SEND (will settle)" : "DRY-RUN (list only)"}\n`);

  const results: PendingResult[] = [];
  for (const custody of custodies) {
    for (const kind of kinds) {
      results.push(await processOne(ctx, CFG[kind], owner, custody));
    }
  }

  const pending = results.filter((r) => r.pending);
  const summary = {
    send,
    owner: owner.toBase58(),
    scanned: custodies.length,
    pendingCount: pending.length,
    processed: pending.filter((r) => r.processed).length,
    errors: pending.filter((r) => r.error).length,
    pending,
  };
  console.log(
    `\n──\nfound ${summary.pendingCount} pending, processed ${summary.processed}` +
      (summary.errors ? `, ${summary.errors} error(s)` : ""),
  );
  if (summary.pendingCount === 0)
    console.log("nothing pending — no receipts to process.");
  return format(summary);
}

// Re-exported only so callers can recognise the delegation-program owner if they
// inspect a base stub directly.
export { DELEGATION_PROGRAM };
