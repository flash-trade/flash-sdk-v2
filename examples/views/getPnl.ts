import { main, ENV, pickMarket } from "../_lib";

// ts-node scripts/views/getPnl.ts   (needs an open position)
main(({ client, poolConfig, wallet }) => {
  const { market, collateralSymbol } = pickMarket(poolConfig);
  return client.views.getPnl(poolConfig, {
    owner: wallet.publicKey,
    market,
    targetSymbol: ENV.targetSymbol,
    collateralSymbol,
  });
});
