import { main, sendBase, phase, logSent } from "../_lib";

// ts-node scripts/setup/delegateBasket.ts          (dry-run)
// SEND=1 ts-node scripts/setup/delegateBasket.ts   (submit)
// The ER validator and commit cadence are fixed on-chain — nothing to configure.

main(async (ctx) => {
  phase("build + submit delegate_basket (base)");
  return logSent(
    await sendBase(ctx, await ctx.client.delegateBasket(ctx.wallet.publicKey)),
  );
});
