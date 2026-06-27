import { main, sendEr, phase, note, ok, logSent } from "../_lib";
import { readLockStatuses, pickWithdrawRequestId } from "./_token";

// CANCEL — cancel a pending unlock by request id (returns locked tokens to the
// active stake).
//
// Direct-ER instruction (#[commit]): the token_stake is already delegated on the
// ER, so this is a single ER tx. The request id is an index into the token_stake
// `withdraw_request` array — pick it with WITHDRAW_REQUEST_ID, else the first
// request that still has locked (un-matured) tokens.
//
// Signed by the owner (the loaded wallet) and sent straight to the ER RPC.
//
// RUN (from client-v2/):
//   npx ts-node scripts/token/cancelUnstakeTokenRequest.ts                  # dry-run (prints lock table + chosen id)
//   SEND=1 npx ts-node scripts/token/cancelUnstakeTokenRequest.ts          # auto-pick the first locked request
//   SEND=1 WITHDRAW_REQUEST_ID=0 npx ts-node scripts/token/cancelUnstakeTokenRequest.ts
//
// Prereq: a pending unlock from unstakeTokenRequest.ts (token_stake delegated on
// the ER).

main(async (ctx) => {
  const owner = ctx.wallet.publicKey;

  phase("read token_stake lock table (choose a request to cancel)");
  const before = await readLockStatuses(ctx, owner);
  // Prefer a request that still has locked tokens (cancellable); fall back to the
  // generic picker (honours WITHDRAW_REQUEST_ID / first-matured / 0).
  const lockedReq = before.find((s) => !s.lockedAmount.isZero());
  const requestId =
    process.env.WITHDRAW_REQUEST_ID !== undefined
      ? Number(process.env.WITHDRAW_REQUEST_ID)
      : lockedReq?.requestId ?? pickWithdrawRequestId(before);
  note(`cancelling withdraw request id=${requestId}`);

  phase("ER: cancel_unstake_token_request_er");
  const ix = await ctx.client.cancelUnstakeTokenRequestEr(requestId, owner);
  const sent = logSent(await sendEr(ctx, { instructions: [ix] }, [ctx.wallet]));
  if (!("signature" in sent)) return { dryRun: true, requestId };
  ok("unlock cancelled");

  phase("read token_stake lock table (post-cancel)");
  const after = await readLockStatuses(ctx, owner);
  note(`withdraw requests: ${before.length} → ${after.length}`);

  return { requestId, phase1: sent, requestsBefore: before.length, requestsAfter: after.length };
});
