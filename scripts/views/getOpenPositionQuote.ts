import { main, ENV, amount, pickMarket } from "../_lib";
import { BN } from "@coral-xyz/anchor";

// ts-node scripts/views/getOpenPositionQuote.ts
// ── CONFIG ──
const amountIn = amount("AMOUNT_IN", "1000000");
const leverage = new BN(process.env.LEVERAGE_BPS || "20000"); // 2x (BPS_DECIMALS=4)

main(({ client, poolConfig }) => {
  const { market, collateralSymbol } = pickMarket(poolConfig);
  return client.views.getOpenPositionQuote(poolConfig, {
    market,
    targetSymbol: ENV.targetSymbol,
    collateralSymbol,
    receivingSymbol: collateralSymbol,
    amountIn,
    leverage,
  });
});
