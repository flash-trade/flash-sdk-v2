import { main, ENV, amount, custodyBySymbol, sendBase, phase, note, ok, logSent } from "../_lib";

// ts-node scripts/setup/depositDirect.ts                        (dry-run)
// SEND=1 ts-node scripts/setup/depositDirect.ts                 (submit; wallet must hold the token)
// SYMBOL=SOL SEND=1 ts-node scripts/setup/depositDirect.ts      (pick the token)
// ── CONFIG ──
const symbol = process.env.SYMBOL || ENV.collateralSymbol;
const depositAmount = amount("DEPOSIT_AMOUNT", "1000000");

main(async (ctx) => {
  phase("resolve mint");
  const mint = custodyBySymbol(ctx.poolConfig, symbol).mintKey;
  note(`${symbol} mint=${mint.toBase58()} amount=${depositAmount.toString()}`);
  ok();

  phase("build + submit deposit_direct (base)");
  return logSent(await sendBase(ctx, await ctx.client.depositDirect(mint, depositAmount)));
});
