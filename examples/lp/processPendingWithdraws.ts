import { main } from "../_lib";
import { processPending } from "./_pending";

// Process ANY pending compounding-withdraw receipt(s) — for EVERY owner, not just
// the loaded wallet. Enumerates delegated withdraw receipts on the ER and drives
// the queued `_er` commit + settle for each. Does NOT create any withdraw.
//
// All tokens (dry-run, just lists what's pending):
//   ts-node scripts/lp/processPendingWithdraws.ts
// All tokens (actually settle them):
//   SEND=1 ts-node scripts/lp/processPendingWithdraws.ts
// A single token:
//   SEND=1 SYMBOL=USDC ts-node scripts/lp/processPendingWithdraws.ts
main((ctx) => processPending(ctx, ["withdraw"]));
