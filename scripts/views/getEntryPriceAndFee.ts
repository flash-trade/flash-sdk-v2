import { main, ENV, amount, pickMarket } from "../_lib";

// ts-node scripts/views/getEntryPriceAndFee.ts
// ── CONFIG ──
const collateral = amount("COLLATERAL", "1000000");
const size = amount("SIZE", "1000000");

main(({ client, poolConfig }) => {
  const { market, side, collateralSymbol } = pickMarket(poolConfig);
  return client.views.getEntryPriceAndFee(poolConfig, {
    market,
    targetSymbol: ENV.targetSymbol,
    collateralSymbol,
    collateral,
    size,
    side,
  });
});
