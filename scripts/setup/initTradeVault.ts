import { main, ENV, custodyBySymbol, sendBase, phase, note, ok, logSent } from "../_lib";

// ts-node scripts/setup/initTradeVault.ts          (dry-run)
// SEND=1 ts-node scripts/setup/initTradeVault.ts   (submit)
// Permissionless; creates the per-mint trade vault `depositDirect` needs.
main(async (ctx) => {
  phase("resolve mint");
  const mint = custodyBySymbol(ctx.poolConfig, ENV.collateralSymbol).mintKey;
  note(`${ENV.collateralSymbol} mint=${mint.toBase58()}`);
  ok();

  phase("build + submit init_trade_vault (base)");
  return logSent(await sendBase(ctx, await ctx.client.initTradeVault(mint)));
});
