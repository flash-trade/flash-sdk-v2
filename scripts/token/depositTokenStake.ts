import { Keypair } from "@solana/web3.js";
import {
  main,
  ENV,
  amount,
  sendBase,
  sendEr,
  pollVisibleOnEr,
  validatorKey,
  phase,
  note,
  ok,
  logSent,
} from "../_lib";
import { findTokenStakeDepositReceiptAddress } from "../../src";
import { TOKEN22, ownerFafAta, pollReceiptSettled } from "./_token";

// STAKE — deposit FAF into the token_stake (governance staking).
//
// Like the other token flows (and unlike LP), deposit_token_stake_with_action
// ALWAYS queues deposit_token_stake_er as an auto-run post-delegation action — the
// validator/keeper runs it right after the base tx, then it queues the base-chain
// settle. So the default flow is two steps:
//   1. base tx (deposit_token_stake_with_action): stage the deposit + delegate
//      BOTH the token_stake account and the deposit receipt. Auto-queues
//      deposit_token_stake_er.
//   2. poll the base chain until the deposit receipt settles + closes.
//
// The token_stake stays delegated on the ER after settle, so unstake/cancel/
// withdraw run against it without re-delegation. Driving deposit_token_stake_er
// manually double-executes it (AccountDiscriminatorNotFound / 0xbb9) — the manual
// `_er` path is RESUME-only recovery for a stuck receipt.
//
// RUN (from client-v2/):
//   npx ts-node scripts/token/depositTokenStake.ts                          # dry-run (build + report)
//   SEND=1 STAKE_AMOUNT=1000000 npx ts-node scripts/token/depositTokenStake.ts
//   SEND=1 STAKE_AMOUNT=1000000 TOKEN22=1 npx ts-node scripts/token/depositTokenStake.ts   # if FAF is Token-2022
//   SEND=1 RESUME=1 npx ts-node scripts/token/depositTokenStake.ts          # recovery: drive _er for a stuck receipt
//
// Full lifecycle (run in order):
//   1) depositTokenStake.ts          stake FAF
//   2) unstakeTokenRequest.ts        begin unlock (wait out the vault unlock_period)
//   3) cancelUnstakeTokenRequest.ts  (optional) cancel a pending unlock
//   4) withdrawTokenWithAction.ts    settle a matured unstake → FAF back to your ATA
//
// NOTE: this delegates the token_stake — if it is ALREADY delegated (from a prior
// stake), the base tx fails. Use unstake/withdraw against the existing stake.
// ── CONFIG ──
const stakeAmount = amount("STAKE_AMOUNT", "1000000");

main(async (ctx) => {
  const owner = ctx.wallet.publicKey;
  const { ata: fundingAccount, createIx, mint } = ownerFafAta(ctx);
  const [receipt] = findTokenStakeDepositReceiptAddress(owner, ctx.client.programId);
  const isResume = process.env.RESUME === "1";

  const out: Record<string, unknown> = {
    fafMint: mint.toBase58(),
    fundingAccount: fundingAccount.toBase58(),
    depositReceipt: receipt.toBase58(),
    stakeAmount: stakeAmount.toString(),
    resume: isResume,
  };

  if (!isResume) {
    // ── Phase 1 — base tx: stage deposit + delegate token_stake & receipt. ──
    phase("base deposit: stage stake + delegate token_stake + receipt (auto-queues _er)");
    note(`stake=${stakeAmount.toString()} funding=${fundingAccount.toBase58()}`);
    const res = await ctx.client.depositTokenStakeWithAction({
      tokenMint: mint,
      fundingAccount,
      depositAmount: stakeAmount,
      commitFrequencyMs: ENV.commitFrequencyMs,
      validator: validatorKey(),
      token22: TOKEN22,
    });
    // Make sure the funding ATA exists (idempotent — cheap if it already does).
    res.instructions.unshift(createIx);
    const sent = logSent(await sendBase(ctx, res));
    out.phase1 = sent;
    if (!("signature" in sent)) return out; // dry-run: stop here
  } else {
    // ── RECOVERY — the auto-action didn't run; drive _er manually. ──
    phase("RESUME — poll the stuck deposit receipt onto the ER (≤30s)");
    await pollVisibleOnEr(ctx, receipt);
    ok("deposit receipt visible on ER");

    const erPayer = Keypair.generate();
    phase("ER commit: deposit_token_stake_er (ephemeral payer)");
    note(`payer=${erPayer.publicKey.toBase58()}`);
    const erRes = await ctx.client.depositTokenStakeEr({
      tokenMint: mint,
      payer: erPayer.publicKey,
      receivingAccount: fundingAccount, // revert destination
      token22: TOKEN22,
    });
    out.resumeEr = logSent(await sendEr(ctx, erRes, [erPayer]));
  }

  // ── Final — wait for the base-layer settle to close the deposit receipt. ──
  phase("poll: wait for base-layer settle to close the deposit receipt (≤90s)");
  await pollReceiptSettled(ctx, receipt);
  ok("deposit receipt settled + closed on base");
  out.settled = true;
  return out;
});
