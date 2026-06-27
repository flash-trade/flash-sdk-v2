import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import {
  main,
  custodyBySymbol,
  phase,
  note,
  ok,
} from "../_lib";
import {
  findCompDepositReceiptAddress,
  findCompWithdrawReceiptAddress,
  findStakingDepositReceiptAddress,
  findStakingWithdrawReceiptAddress,
  findMigrateFlpReceiptAddress,
  findMigrateStakeReceiptAddress,
} from "@flash_trade/flash-sdk-v2";
import { finalizeReceipt, receiptState, type FinalizeCfg } from "./_finalize";

// Directly CLOSE a stuck LP / migrate receipt by driving its terminal
// settle instruction on the base chain.
//
// Use this to recover a receipt left "processed-but-open" (the `_er` commit ran
// but the ER-queued settle didn't close it). It reads the receipt's decision
// field for logging, then runs the unified settle finalizer; it does NOT run
// `_er` (use the per-flow script's resume for a not-yet-processed receipt).
//
// FLOW ∈ { remove-liquidity, add-stake, add-compounding, remove-compounding,
//          migrate-flp, migrate-stake }. SYMBOL selects the custody for the
// per-token flows (ignored for the pool-scoped migrate flows).
//
//   FLOW=remove-liquidity SYMBOL=BTC ts-node scripts/lp/closeReceipt.ts          # dry-run
//   SEND=1 FLOW=remove-liquidity SYMBOL=BTC ts-node scripts/lp/closeReceipt.ts   # close it
//   SEND=1 FLOW=migrate-flp ts-node scripts/lp/closeReceipt.ts
//   OWNER=<pubkey> ... to close someone else's receipt (fee paid by this wallet).

type Flow =
  | "remove-liquidity"
  | "add-stake"
  | "add-compounding"
  | "remove-compounding"
  | "migrate-flp"
  | "migrate-stake";

const flow = (process.env.FLOW || "") as Flow;
const symbol = process.env.SYMBOL;

main(async (ctx) => {
  const owner = process.env.OWNER ? new PublicKey(process.env.OWNER) : ctx.wallet.publicKey;
  const pc = ctx.poolConfig;
  const pid = ctx.client.programId;
  const pool = pc.poolAddress;

  // Per-token flows need a custody; migrate flows are pool-scoped.
  const needsSymbol = flow !== "migrate-flp" && flow !== "migrate-stake";
  const custody = needsSymbol
    ? custodyBySymbol(pc, symbol || (() => { throw new Error("set SYMBOL for this flow"); })())
    : undefined;
  const receivingAccount = custody
    ? getAssociatedTokenAddressSync(custody.mintKey, owner, true)
    : owner;

  const cfgs: Record<Flow, () => FinalizeCfg> = {
    "remove-liquidity": () => ({
      receipt: findStakingWithdrawReceiptAddress(owner, custody!.mintKey, pid)[0],
      accountNamespace: "stakingWithdrawReceipt",
      decisionField: "tokenAmountToWithdraw",
      settle: () => ctx.client.removeLiquiditySettle(pc, { outSymbol: custody!.symbol, receivingAccount, owner }),
    }),
    "add-stake": () => ({
      receipt: findStakingDepositReceiptAddress(owner, custody!.mintKey, pid)[0],
      accountNamespace: "stakingDepositReceipt",
      decisionField: "lpTokensToMint",
      settle: () => ctx.client.addLiquidityAndStakeSettle(pc, { symbol: custody!.symbol, owner }),
    }),
    "add-compounding": () => ({
      receipt: findCompDepositReceiptAddress(owner, custody!.mintKey, pid)[0],
      accountNamespace: "compoundingDepositReceipt",
      decisionField: "userLpToMint",
      altDecisionField: "compoundingToMint",
      settle: () => ctx.client.addCompoundingLiquiditySettle(pc, { symbol: custody!.symbol, owner }),
    }),
    "remove-compounding": () => ({
      receipt: findCompWithdrawReceiptAddress(owner, custody!.mintKey, pid)[0],
      accountNamespace: "compoundingWithdrawReceipt",
      decisionField: "outTokenAmount",
      settle: () => ctx.client.removeCompoundingLiquiditySettle(pc, { symbol: custody!.symbol, owner }),
    }),
    "migrate-flp": () => ({
      receipt: findMigrateFlpReceiptAddress(owner, pool, pid)[0],
      accountNamespace: "migrateFlpReceipt",
      decisionField: "lpAmountOut",
      settle: () => ctx.client.migrateFlpSettle(pc, { owner }),
    }),
    "migrate-stake": () => ({
      receipt: findMigrateStakeReceiptAddress(owner, pool, pid)[0],
      accountNamespace: "migrateStakeReceipt",
      decisionField: "compoundingAmountOut",
      settle: () => ctx.client.migrateStakeSettle(pc, { owner }),
    }),
  };

  if (!cfgs[flow]) {
    throw new Error(`set FLOW to one of: ${Object.keys(cfgs).join(", ")}`);
  }
  const cfg = cfgs[flow]();

  phase(`close ${flow}${custody ? ` ${custody.symbol}` : ""}`);
  note(`owner=${owner.toBase58()} receipt=${cfg.receipt.toBase58()}`);

  const state = await receiptState(ctx, cfg.receipt, cfg.accountNamespace);
  note(`state=${state}`);
  if (state === "absent") {
    ok("receipt not found — already closed, nothing to do");
    return { receipt: cfg.receipt.toBase58(), state, closed: true };
  }
  if (state === "delegated") {
    note("receipt is still delegated / not yet processed — run the flow's own");
    note("script resume to drive `_er` first; this tool only closes processed receipts.");
    return { receipt: cfg.receipt.toBase58(), state, closed: false };
  }

  const finalize = await finalizeReceipt(ctx, cfg);
  return { receipt: cfg.receipt.toBase58(), state, finalize };
});
