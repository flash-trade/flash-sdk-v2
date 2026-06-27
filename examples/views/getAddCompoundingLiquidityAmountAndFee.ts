import { main, ENV, amount } from "../_lib";

// ts-node scripts/views/getAddCompoundingLiquidityAmountAndFee.ts
// ── CONFIG ──
const inSymbol = ENV.collateralSymbol;
const amountIn = amount("AMOUNT_IN", "1000000");

main(({ client, poolConfig }) =>
  client.views.getAddCompoundingLiquidityAmountAndFee(poolConfig, {
    inSymbol,
    amountIn,
  }),
);
