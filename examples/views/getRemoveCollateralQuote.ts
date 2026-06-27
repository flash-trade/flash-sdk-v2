import { main, ENV, amount, pickMarket } from "../_lib";

// ts-node scripts/views/getRemoveCollateralQuote.ts   (needs an open position)
// ── CONFIG ──
const collateralDeltaUsd = amount("COLLATERAL_DELTA_USD", "1000000");

main(({ client, poolConfig, wallet }) => {
  const { market, collateralSymbol } = pickMarket(poolConfig);
  return client.views.getRemoveCollateralQuote(poolConfig, {
    owner: wallet.publicKey,
    market,
    targetSymbol: ENV.targetSymbol,
    collateralSymbol,
    dispensingSymbol: collateralSymbol,
    collateralDeltaUsd,
  });
});
