import {
  main,
  amount,
  marketForSide,
  entryPrice,
  sendEr,
  phase,
  note,
  ok,
  logSent,
  sideName,
} from "../_lib";
import { BN } from "@coral-xyz/anchor";

// One-shot SOL long, funded with USDC, collateral locked as JitoSOL (SDK override).
//   ts-node scripts/trade/openSolLongLive.ts                       (dry-run)
//   SEND=1 SESSION_KEY=... ts-node scripts/trade/openSolLongLive.ts (submit, ER)
// ── CONFIG ──
const amountIn = amount("AMOUNT_IN", "2000000"); // 2 USDC (6dp) funded
const leverage = new BN(process.env.LEVERAGE || "20000"); // 2x
const fundingSymbol = process.env.FUNDING_SYMBOL || "USDC";

main(async (ctx) => {
  phase("resolve SOL long market (override → JitoSOL)");
  const { market, side, collateralSymbol } = marketForSide(ctx, "SOL", "long");
  note(`market=${market.toBase58()} side=${sideName(side)} lockCollateral=${collateralSymbol} funding=${fundingSymbol}`);
  if (ctx.session) ctx.client.useSession(ctx.session.publicKey);
  ok();

  phase("quote size @leverage");
  const quote: any = await ctx.client.views.getOpenPositionQuote(ctx.poolConfig, {
    market,
    targetSymbol: "SOL",
    collateralSymbol, // on-chain collateral custody (JitoSOL)
    receivingSymbol: fundingSymbol, // funding token (USDC)
    amountIn,
    leverage,
  });
  const size: BN = quote?.sizeAmount ?? amountIn;
  note(`sizeAmount=${size.toString()}`);
  ok();

  phase("build + submit open_position (ER)");
  const price = await entryPrice(ctx, "SOL", side, true);
  note(`entryPrice=${price.price.toString()}`);
  const res = await ctx.client.openPosition(
    "SOL",
    collateralSymbol, // lock symbol (idempotent → JitoSOL)
    fundingSymbol, // funding/receiving token — swapped into JitoSOL
    side,
    ctx.poolConfig,
    price,
    amountIn,
    size,
  );
  return logSent(await sendEr(ctx, res, ctx.session ? [ctx.session] : []));
});
