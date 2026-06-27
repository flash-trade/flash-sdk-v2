import { main, ENV, amount } from "../_lib";

// ts-node scripts/views/getAddLiquidityAmountAndFee.ts
// ── CONFIG ──
const symbol = ENV.collateralSymbol;
const amountIn = amount("AMOUNT_IN", "1000000");

main(({ client, poolConfig }) =>
  client.views.getAddLiquidityAmountAndFee(poolConfig, { symbol, amountIn }),
);
