import { main, ENV, amount, pickMarket, sendEr, phase, note, ok, logSent, sideName } from "../_lib";

// ts-node scripts/trade/removeCollateral.ts          (dry-run)
// SEND=1 SESSION_KEY=~/session.json ts-node scripts/trade/removeCollateral.ts   (submit)
// Cross-custody: DISPENSING_SYMBOL=SOL ts-node scripts/trade/removeCollateral.ts
// ── CONFIG ──
const collateralDeltaUsd = amount("COLLATERAL_DELTA_USD", "1000000");
// Token received on withdrawal; defaults to the collateral token (single-custody).
const dispensingSymbol = process.env.DISPENSING_SYMBOL || undefined;

main(async (ctx) => {
  phase("resolve market");
  const { collateralSymbol, side } = pickMarket(ctx.poolConfig);
  if (ctx.session) ctx.client.useSession(ctx.session.publicKey);
  note(`target=${ENV.targetSymbol} side=${sideName(side)} collateral=${collateralSymbol} deltaUsd=${collateralDeltaUsd.toString()} dispensing=${dispensingSymbol ?? collateralSymbol}`);
  ok();

  phase("build + submit remove_collateral (ER)");
  const res = await ctx.client.removeCollateral(
    ENV.targetSymbol,
    collateralSymbol,
    side,
    ctx.poolConfig,
    collateralDeltaUsd,
    dispensingSymbol,
  );
  return logSent(await sendEr(ctx, res, ctx.session ? [ctx.session] : []));
});
