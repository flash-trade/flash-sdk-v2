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
import type { Side } from "@flash_trade/flash-sdk-v2";

// Exercises the SOL/WSOL long+short markets and shows the collateral custody the
// SDK resolves for each. SOL/WSOL longs now lock JitoSOL collateral (override);
// shorts stay USDC. Dry-run by default — set SEND=1 (+ SESSION_KEY) to submit.
//
//   ts-node scripts/trade/openSolVariants.ts
//   SEND=1 SESSION_KEY=~/session.json ts-node scripts/trade/openSolVariants.ts
// ── CONFIG ──
const collateralAmount = amount("COLLATERAL_AMOUNT", "1000000");
const sizeAmount = amount("SIZE_AMOUNT", "1000000");
// Token the trader funds with. SOL/WSOL longs lock JitoSOL, but the program
// swaps the funding token in — so we can fund the whole set with USDC.
const fundingSymbol = process.env.FUNDING_SYMBOL || "USDC";

type Variant = { target: string; side: "long" | "short" };
const VARIANTS: Variant[] = [
  { target: "SOL", side: "long" },
  { target: "SOL", side: "short" },
  { target: "WSOL", side: "long" },
  { target: "WSOL", side: "short" },
];

main(async (ctx) => {
  if (ctx.session) ctx.client.useSession(ctx.session.publicKey);

  for (const { target, side: wantSide } of VARIANTS) {
    phase(`${target} ${wantSide}`);

    // Resolve the market the SDK will actually trade against.
    const { market, side, collateralSymbol } = marketForSide(ctx, target, wantSide);

    // The override is LONG-only: for longs it remaps the lock symbol (SOL→JitoSOL);
    // for shorts it echoes the target, so it only tells us what to assert on longs.
    const override = ctx.client.resolveCollateralSymbol(target, target, side as Side);
    const overridden = wantSide === "long" && override !== target;
    note(
      `market=${market.toBase58()} side=${sideName(side)} collateral=${collateralSymbol}` +
        (overridden ? ` (long override: ${target}→${override})` : ""),
    );

    // Sanity: a long with an override must resolve to that collateral custody.
    if (overridden && collateralSymbol !== override) {
      throw new Error(
        `collateral mismatch for ${target} ${wantSide}: got ${collateralSymbol}, expected ${override}`,
      );
    }

    const price = await entryPrice(ctx, target, side, true);
    note(`entryPrice=${price.price.toString()} funding=${fundingSymbol}`);

    const res = await ctx.client.openPosition(
      target,
      collateralSymbol, // lock symbol (JitoSOL for SOL long, USDC for short)
      fundingSymbol,    // funding/receiving token — swapped into the lock custody
      side,
      ctx.poolConfig,
      price,
      collateralAmount,
      sizeAmount,
    );
    logSent(await sendEr(ctx, res, ctx.session ? [ctx.session] : []));
    ok();
  }

  return { variants: VARIANTS.length };
});
