import { main, sendBase, phase, logSent } from "../_lib";

// ts-node scripts/setup/initializeBasket.ts          (dry-run)
// SEND=1 ts-node scripts/setup/initializeBasket.ts   (submit)
main(async (ctx) => {
  phase("build + submit initialize_basket (base)");
  return logSent(await sendBase(ctx, await ctx.client.initializeBasket()));
});
