import { main } from "../_lib";
import { processPending } from "./_pending";

// Process ANY pending LP receipt in one pass — across BOTH the compounding (sFLP)
// and staked-LP (FLP) flows, in both directions:
//   deposit / withdraw           — add/remove_compounding_liquidity (sFLP)
//   stake-deposit / staked-withdraw — add_liquidity_and_stake / remove_liquidity
// Per token, derives each receipt PDA and drives the queued `_er` commit + settle.
// Creates nothing; only settles what's already pending.
//
// All tokens, all kinds (dry-run, just lists what's pending):
//   ts-node scripts/lp/processPendingLiquidity.ts
// All tokens, all kinds (actually settle them):
//   SEND=1 ts-node scripts/lp/processPendingLiquidity.ts
// A single token:
//   SEND=1 SYMBOL=USDC ts-node scripts/lp/processPendingLiquidity.ts
main((ctx) =>
  processPending(ctx, ["deposit", "withdraw", "stake-deposit", "staked-withdraw"]),
);
