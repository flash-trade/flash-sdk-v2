import { main, ENV, amount, pickMarket } from "../_lib";

// ts-node scripts/views/getAddCollateralQuote.ts   (needs an open position)
// ── CONFIG ──
const amountIn = amount("AMOUNT_IN", "1000000");

main(({ client, poolConfig, wallet }) => {
  const { market, collateralSymbol } = pickMarket(poolConfig);
  return client.views.getAddCollateralQuote(poolConfig, {
    owner: wallet.publicKey,
    market,
    targetSymbol: ENV.targetSymbol,
    collateralSymbol,
    receivingSymbol: collateralSymbol,
    amountIn,
  });
});
