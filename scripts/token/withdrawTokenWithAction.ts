import { Keypair } from "@solana/web3.js";
import {
  main,
  ENV,
  sendBase,
  sendEr,
  pollVisibleOnEr,
  validatorKey,
  phase,
  note,
  ok,
  logSent,
} from "../_lib";
import { findWithdrawTokenReceiptAddress } from "../../src";
import {
  TOKEN22,
  ownerFafAta,
  readLockStatuses,
  pickWithdrawRequestId,
  pollReceiptSettled,
} from "./_token";

// WITHDRAW — settle a matured unstake (withdraw FAF back to the user's ATA).
//
// Unlike the LP flow, withdraw_token_with_action ALWAYS queues withdraw_token_er
// as an auto-run post-delegation action (the validator/keeper executes it right
// after the base tx — no client driving and no `queueErAction` opt-out). So the
// default flow is just two steps:
//   1. base tx (withdraw_token_with_action): record the target withdraw_request_id
//      on the receipt + delegate it. This auto-queues withdraw_token_er, which
//      pays the matured amount and queues withdraw_token_settle.
//   2. poll the base chain until the receipt settles + closes.
//
// Driving withdraw_token_er manually (the old way) double-executes it and fails
// with AccountDiscriminatorNotFound (0xbb9 / 3001) — the auto-action already
// processed + closed the receipt. The manual `_er` path is therefore RESUME-only
// recovery, for when the auto-action did NOT run and the receipt is stuck
// delegated+pending on the ER.
//
// `amount==0` is the no-op "revert" path that just closes the receipt (nothing
// matured / stale id / withdrawals disabled). Pick the request id with
// WITHDRAW_REQUEST_ID, else the first MATURED request (non-zero withdrawable).
//
// RUN (from client-v2/):
//   npx ts-node scripts/token/withdrawTokenWithAction.ts                    # dry-run (prints lock table + chosen id)
//   SEND=1 npx ts-node scripts/token/withdrawTokenWithAction.ts            # auto-pick the first matured request
//   SEND=1 WITHDRAW_REQUEST_ID=0 npx ts-node scripts/token/withdrawTokenWithAction.ts
//   SEND=1 RESUME=1 npx ts-node scripts/token/withdrawTokenWithAction.ts   # recovery: drive _er for a stuck receipt
//
// Prereq: a MATURED unstake (run unstakeTokenRequest.ts, then wait out the vault
// unlock_period). Common env: WALLET=~/key.json CLUSTER=devnet (see scripts/README.md).

main(async (ctx) => {
  const owner = ctx.wallet.publicKey;
  const { ata: receivingTokenAccount, createIx, mint } = ownerFafAta(ctx);
  const [receipt] = findWithdrawTokenReceiptAddress(owner, ctx.client.programId);
  const isResume = process.env.RESUME === "1";

  const out: Record<string, unknown> = {
    fafMint: mint.toBase58(),
    receivingTokenAccount: receivingTokenAccount.toBase58(),
    withdrawReceipt: receipt.toBase58(),
    resume: isResume,
  };

  if (!isResume) {
    // ── Phase 1 — base tx: record request id + delegate the receipt. ──
    // This auto-queues withdraw_token_er → withdraw_token_settle (keeper-driven).
    phase("read token_stake lock table (choose a matured request)");
    const statuses = await readLockStatuses(ctx, owner);
    const withdrawRequestId = pickWithdrawRequestId(statuses);
    out.withdrawRequestId = withdrawRequestId;

    phase("base withdraw: record request id + delegate receipt (auto-queues _er)");
    note(`requestId=${withdrawRequestId} receipt=${receipt.toBase58()}`);
    const res = await ctx.client.withdrawTokenWithAction({
      tokenMint: mint,
      receivingTokenAccount,
      withdrawRequestId,
      commitFrequencyMs: ENV.commitFrequencyMs,
      validator: validatorKey(),
      token22: TOKEN22,
    });
    // Guarantee the receiving ATA exists before the settle pays into it.
    res.instructions.unshift(createIx);
    const sent = logSent(await sendBase(ctx, res));
    out.phase1 = sent;
    if (!("signature" in sent)) return out; // dry-run: stop here
  } else {
    // ── RECOVERY — the auto-action didn't run; drive _er manually. ──
    phase("RESUME — poll the stuck receipt onto the ER (≤30s)");
    await pollVisibleOnEr(ctx, receipt);
    ok("withdraw receipt visible on ER");

    const erPayer = Keypair.generate();
    phase("ER commit: withdraw_token_er (ephemeral payer)");
    note(`payer=${erPayer.publicKey.toBase58()}`);
    const erRes = await ctx.client.withdrawTokenEr({
      tokenMint: mint,
      receivingTokenAccount,
      payer: erPayer.publicKey,
      token22: TOKEN22,
    });
    out.resumeEr = logSent(await sendEr(ctx, erRes, [erPayer]));
  }

  // ── Final — wait for the base-layer settle to close the receipt. ──
  phase("poll: wait for base-layer settle to close the withdraw receipt (≤90s)");
  await pollReceiptSettled(ctx, receipt);
  ok("withdraw receipt settled + closed on base");
  out.settled = true;
  return out;
});
