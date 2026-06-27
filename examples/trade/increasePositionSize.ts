import { main, ENV, amount, pickMarket, entryPrice, sendEr, phase, note, ok, logSent, sideName } from "../_lib";

// ts-node scripts/trade/increasePositionSize.ts          (dry-run)
// SEND=1 SESSION_KEY=~/session.json ts-node scripts/trade/increasePositionSize.ts   (submit)
// ── CONFIG ──
const sizeDelta = amount("SIZE_DELTA", "1000000");
// increase_position_size_er rejects delta_collateral_amount == 0
const collateralAmount = amount("COLLATERAL_AMOUNT", "500000");

main(async (ctx) => {
  phase("resolve market + entry price");
  const { collateralSymbol, side } = pickMarket(ctx.poolConfig);
  const price = await entryPrice(ctx, ENV.targetSymbol, side, true);
  if (ctx.session) ctx.client.useSession(ctx.session.publicKey);
  note(`target=${ENV.targetSymbol} side=${sideName(side)} collateral=${collateralSymbol} sizeDelta=${sizeDelta.toString()} collateralDelta=${collateralAmount.toString()}`);
  ok();

  phase("build + submit increase_position_size (ER)");
  const res = await ctx.client.increasePositionSize(
    ENV.targetSymbol,
    collateralSymbol,
    side,
    ctx.poolConfig,
    price,
    sizeDelta,
    collateralAmount,
  );
  return logSent(await sendEr(ctx, res, ctx.session ? [ctx.session] : []));
});
