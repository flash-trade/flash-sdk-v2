import { main, ENV, pickMarket } from "../_lib";

// ts-node scripts/views/getLiquidationPrice.ts   (needs an open position)
main(({ client, poolConfig, wallet }) => {
  const { market, collateralSymbol } = pickMarket(poolConfig);
  return client.views.getLiquidationPrice(poolConfig, {
    owner: wallet.publicKey,
    market,
    targetSymbol: ENV.targetSymbol,
    collateralSymbol,
  });
});
