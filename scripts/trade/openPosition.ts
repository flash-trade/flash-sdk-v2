import { main, ENV, amount, pickMarket, entryPrice, sendEr, phase, note, ok, logSent, sideName } from "../_lib";

// ts-node scripts/trade/openPosition.ts          (dry-run)
// SEND=1 SESSION_KEY=~/session.json ts-node scripts/trade/openPosition.ts   (submit)
// ── CONFIG ──
const collateralAmount = amount("COLLATERAL_AMOUNT", "1000000");
const sizeAmount = amount("SIZE_AMOUNT", "1000000");

main(async (ctx) => {
  phase("resolve market + entry price");
  const { collateralSymbol, side } = pickMarket(ctx.poolConfig);
  const price = await entryPrice(ctx, ENV.targetSymbol, side, true);
  if (ctx.session) ctx.client.useSession(ctx.session.publicKey);
  note(`target=${ENV.targetSymbol} side=${sideName(side)} collateral=${collateralSymbol} entryPrice=${price.price.toString()}`);
  ok();

  phase("build + submit open_position (ER)");
  const res = await ctx.client.openPosition(
    ENV.targetSymbol,
    collateralSymbol, // lock symbol
    collateralSymbol, // collateral symbol
    side,
    ctx.poolConfig,
    price,
    collateralAmount,
    sizeAmount,
  );
  return logSent(await sendEr(ctx, res, ctx.session ? [ctx.session] : []));
});
