import { main, ENV, amount } from "../_lib";

// ts-node scripts/views/getSwapAmountAndFees.ts
// ── CONFIG ──
const receivingSymbol = ENV.targetSymbol;
const dispensingSymbol = ENV.collateralSymbol;
const amountIn = amount("AMOUNT_IN", "1000000");

main(({ client, poolConfig }) =>
  client.views.getSwapAmountAndFees(poolConfig, {
    receivingSymbol,
    dispensingSymbol,
    amountIn,
  }),
);
