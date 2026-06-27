import { main, ENV, amount } from "../_lib";

// ts-node scripts/views/getRemoveLiquidityAmountAndFee.ts
// ── CONFIG ──
const symbol = ENV.collateralSymbol;
const lpAmountIn = amount("LP_AMOUNT_IN", "1000000");

main(({ client, poolConfig }) =>
  client.views.getRemoveLiquidityAmountAndFee(poolConfig, { symbol, lpAmountIn }),
);
