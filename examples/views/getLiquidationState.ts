import { main, ENV, pickMarket } from "../_lib";

// ts-node scripts/views/getLiquidationState.ts   (needs an open position)
main(({ client, poolConfig, wallet }) => {
  const { market, collateralSymbol } = pickMarket(poolConfig);
  return client.views.getLiquidationState(poolConfig, {
    owner: wallet.publicKey,
    market,
    targetSymbol: ENV.targetSymbol,
    collateralSymbol,
  });
});
