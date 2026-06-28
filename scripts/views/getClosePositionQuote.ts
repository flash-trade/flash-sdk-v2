import { main, ENV, amount, pickMarket } from "../_lib";

// ts-node scripts/views/getClosePositionQuote.ts   (needs an open position)
// ── CONFIG ──
const sizeDeltaUsd = amount("SIZE_DELTA_USD", "1000000");

main(({ client, poolConfig, wallet }) => {
  const { market, collateralSymbol } = pickMarket(poolConfig);
  return client.views.getClosePositionQuote(poolConfig, {
    owner: wallet.publicKey,
    market,
    targetSymbol: ENV.targetSymbol,
    collateralSymbol,
    dispensingSymbol: collateralSymbol,
    sizeDeltaUsd,
  });
});
