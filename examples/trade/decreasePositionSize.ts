import { main, ENV, amount, pickMarket, entryPrice, sendEr, phase, note, ok, logSent, sideName } from "../_lib";

// ts-node scripts/trade/decreasePositionSize.ts          (dry-run)
// SEND=1 SESSION_KEY=~/session.json ts-node scripts/trade/decreasePositionSize.ts   (submit)
// ── CONFIG ──
const sizeDelta = amount("SIZE_DELTA", "1000000");

main(async (ctx) => {
  phase("resolve market + exit price");
  const { collateralSymbol, side } = pickMarket(ctx.poolConfig);
  const price = await entryPrice(ctx, ENV.targetSymbol, side, false); // exit price
  if (ctx.session) ctx.client.useSession(ctx.session.publicKey);
  note(`target=${ENV.targetSymbol} side=${sideName(side)} collateral=${collateralSymbol} sizeDelta=${sizeDelta.toString()}`);
  ok();

  phase("build + submit decrease_position_size (ER)");
  const res = await ctx.client.decreasePositionSize(
    ENV.targetSymbol,
    collateralSymbol,
    side,
    ctx.poolConfig,
    price,
    sizeDelta,
  );
  return logSent(await sendEr(ctx, res, ctx.session ? [ctx.session] : []));
});
