import { main, sendBase, phase, logSent } from "../_lib";

// ts-node scripts/setup/initializeUserDepositLedger.ts          (dry-run)
// SEND=1 ts-node scripts/setup/initializeUserDepositLedger.ts   (submit)
main(async (ctx) => {
  phase("build + submit initialize_user_deposit_ledger (base)");
  return logSent(await sendBase(ctx, await ctx.client.initializeUserDepositLedger()));
});
