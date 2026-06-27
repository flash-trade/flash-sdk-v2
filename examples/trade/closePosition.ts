import { main, ENV, pickMarket, entryPrice, sendEr, phase, note, ok, logSent, sideName } from "../_lib";

// ts-node scripts/trade/closePosition.ts          (dry-run)
// SEND=1 SESSION_KEY=~/session.json ts-node scripts/trade/closePosition.ts   (submit)
main(async (ctx) => {
  phase("resolve market + exit price");
  const { collateralSymbol, side } = pickMarket(ctx.poolConfig);
  const price = await entryPrice(ctx, ENV.targetSymbol, side, false); // exit price
  if (ctx.session) ctx.client.useSession(ctx.session.publicKey);
  note(`target=${ENV.targetSymbol} side=${sideName(side)} collateral=${collateralSymbol} exitPrice=${price.price.toString()}`);
  ok();

  phase("build + submit close_position (ER)");
  const res = await ctx.client.closePosition(
    ENV.targetSymbol,
    collateralSymbol,
    side,
    ctx.poolConfig,
    price,
  );
  return logSent(await sendEr(ctx, res, ctx.session ? [ctx.session] : []));
});
