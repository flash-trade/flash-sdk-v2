import { main } from "../_lib";
import { processPending } from "./_pending";

// Process ANY pending compounding-deposit receipt(s) — for EVERY owner, not just
// the loaded wallet. Enumerates delegated deposit receipts on the ER and drives
// the queued `_er` commit + settle for each. Does NOT create any deposit.
//
// All tokens (dry-run, just lists what's pending):
//   ts-node scripts/lp/processPendingDeposits.ts
// All tokens (actually settle them):
//   SEND=1 ts-node scripts/lp/processPendingDeposits.ts
// A single token:
//   SEND=1 SYMBOL=USDC ts-node scripts/lp/processPendingDeposits.ts
main((ctx) => processPending(ctx, ["deposit"]));
