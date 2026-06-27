import { main, amount, sendEr, phase, note, ok, logSent } from "../_lib";
import { readLockStatuses } from "./_token";

// UNSTAKE — begin an unlock (cooldown) on a portion of the active stake.
//
// Direct-ER instruction (#[commit]): the token_stake is already delegated on the
// ER (from depositTokenStake), so this is a single ER tx — no base/settle phases.
// It appends a new entry to the token_stake `withdraw_request` array whose
// `withdrawableAmount` matures after the vault `unlock_period`. Once matured,
// settle it with `withdrawTokenWithAction`.
//
// Signed by the owner (the loaded wallet) and sent straight to the ER RPC.
//
// RUN (from client-v2/):
//   npx ts-node scripts/token/unstakeTokenRequest.ts                        # dry-run (build + report)
//   SEND=1 npx ts-node scripts/token/unstakeTokenRequest.ts                 # unstake the default amount
//   SEND=1 UNSTAKE_AMOUNT=500000 npx ts-node scripts/token/unstakeTokenRequest.ts
//
// Prereq: the token_stake must already be delegated on the ER (run
// depositTokenStake.ts first). After this, wait out the vault unlock_period, then
// settle with withdrawTokenWithAction.ts.
// ── CONFIG ──
const unstakeAmount = amount("UNSTAKE_AMOUNT", "500000");

main(async (ctx) => {
  const owner = ctx.wallet.publicKey;

  phase("read token_stake lock table (pre-unstake)");
  const before = await readLockStatuses(ctx, owner);
  note(`existing withdraw requests: ${before.length}`);

  phase("ER: unstake_token_request_er (begin unlock)");
  note(`unstake=${unstakeAmount.toString()}`);
  const ix = await ctx.client.unstakeTokenRequestEr(unstakeAmount, owner);
  const sent = logSent(await sendEr(ctx, { instructions: [ix] }, [ctx.wallet]));
  if (!("signature" in sent)) return { dryRun: true, unstakeAmount: unstakeAmount.toString() };
  ok("unlock requested");

  phase("read token_stake lock table (post-unstake)");
  const after = await readLockStatuses(ctx, owner);
  for (const s of after)
    note(
      `req#${s.requestId}: locked=${s.lockedAmount.toString()} ` +
        `withdrawable=${s.withdrawableAmount.toString()} ` +
        `timeRemaining=${s.timeRemaining.toString()}s`,
    );

  return {
    unstakeAmount: unstakeAmount.toString(),
    phase1: sent,
    requestsBefore: before.length,
    requestsAfter: after.length,
  };
});
