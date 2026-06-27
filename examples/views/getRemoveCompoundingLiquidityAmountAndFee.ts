import { main, ENV, amount } from "../_lib";

// ts-node scripts/views/getRemoveCompoundingLiquidityAmountAndFee.ts
// ── CONFIG ──
const outSymbol = ENV.collateralSymbol;
const compoundingAmountIn = amount("COMPOUNDING_AMOUNT_IN", "1000000");

main(({ client, poolConfig }) =>
  client.views.getRemoveCompoundingLiquidityAmountAndFee(poolConfig, {
    outSymbol,
    compoundingAmountIn,
  }),
);
