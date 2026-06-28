import { main } from "../_lib";
import { processPending } from "./_pending";

// Process ANY pending staked-LP withdraw receipt(s) — the `remove_liquidity` flow
// (unstake + redeem FLP for the chosen token). Enumerates delegated
// staking-withdraw receipts per token and drives the queued `remove_liquidity_er`
// commit + settle for each. Creates nothing; only settles what's already pending —
// the RESUME tail of scripts/lp/removeLiquidity.ts.
//
// All tokens (dry-run, just lists what's pending):
//   ts-node scripts/lp/processPendingStakedWithdraw.ts
// All tokens (actually settle them):
//   SEND=1 ts-node scripts/lp/processPendingStakedWithdraw.ts
// A single token:
//   SEND=1 SYMBOL=USDC ts-node scripts/lp/processPendingStakedWithdraw.ts
main((ctx) => processPending(ctx, ["staked-withdraw"]));
