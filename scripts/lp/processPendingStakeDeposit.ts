import { main } from "../_lib";
import { processPending } from "./_pending";

// Process ANY pending staked-LP deposit receipt(s) — the `add_liquidity_and_stake`
// flow (mints + stakes FLP). Enumerates delegated staking-deposit receipts per
// token and drives the queued `add_liquidity_and_stake_er` commit + settle for
// each. Creates nothing; only settles what's already pending — the RESUME tail of
// scripts/lp/addLiquidityAndStake.ts.
//
// All tokens (dry-run, just lists what's pending):
//   ts-node scripts/lp/processPendingStakeDeposit.ts
// All tokens (actually settle them):
//   SEND=1 ts-node scripts/lp/processPendingStakeDeposit.ts
// A single token:
//   SEND=1 SYMBOL=USDC ts-node scripts/lp/processPendingStakeDeposit.ts
main((ctx) => processPending(ctx, ["stake-deposit"]));
