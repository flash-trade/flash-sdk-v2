import { main, ENV, amount, pickMarket, sendEr, phase, note, ok, logSent, sideName } from "../_lib";

// ts-node scripts/trade/addCollateral.ts          (dry-run)
// SEND=1 SESSION_KEY=~/session.json ts-node scripts/trade/addCollateral.ts   (submit)
// Cross-custody: RECEIVING_SYMBOL=SOL ts-node scripts/trade/addCollateral.ts
// ── CONFIG ──
const collateralDelta = amount("COLLATERAL_DELTA", "1000000");
// Token funding the deposit; defaults to the collateral token (single-custody).
const receivingSymbol = process.env.RECEIVING_SYMBOL || undefined;

main(async (ctx) => {
  phase("resolve market");
  const { collateralSymbol, side } = pickMarket(ctx.poolConfig);
  if (ctx.session) ctx.client.useSession(ctx.session.publicKey);
  note(`target=${ENV.targetSymbol} side=${sideName(side)} collateral=${collateralSymbol} delta=${collateralDelta.toString()} funding=${receivingSymbol ?? collateralSymbol}`);
  ok();

  phase("build + submit add_collateral (ER)");
  const res = await ctx.client.addCollateral(
    ENV.targetSymbol,
    collateralSymbol,
    side,
    ctx.poolConfig,
    collateralDelta,
    receivingSymbol,
  );
  return logSent(await sendEr(ctx, res, ctx.session ? [ctx.session] : []));
});
