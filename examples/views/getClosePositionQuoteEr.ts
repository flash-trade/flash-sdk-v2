import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { main, ENV, custodyBySymbol } from "../_lib";
import { Privilege } from "@flash_trade/flash-sdk-v2";

// Close-position quote for an ER (MagicBlock) pool — full OR partial.
//
// MagicBlock pools (e.g. devnet.4, Community.1) keep positions basket-held on
// the ER, so we read the basket (ER) for the live size and use the *_Er view.
// (The base `getClosePositionQuote.ts` reads a position PDA that doesn't exist
//  for these pools.)
//
// Run (devnet.4 PENGU short, full close — matches the UI request):
//   CLUSTER=devnet POOL=devnet.4 ER_ENDPOINT=https://devnet-as.magicblock.app \
//   TARGET_SYMBOL=PENGU SIDE=short OWNER=JwV3M6PvMykzYeQznSeZA7WdwTvyaXCC4dFWoKvSYZS \
//   npx ts-node scripts/views/getClosePositionQuoteEr.ts
//
// ── env knobs ──
//   OWNER           position owner (defaults to the loaded wallet)
//   TARGET_SYMBOL   market target (e.g. PENGU, SOL)
//   SIDE            long | short                        (default: short)
//   SIZE_AMOUNT     partial close, in target-token base units (sizeDecimals)
//   SIZE_DELTA_USD  partial close, in USD 6dp (takes precedence over SIZE_AMOUNT)
//   (omit both      → FULL close: sizeDeltaUsd = position.sizeUsd)
//   DISPENSING_SYMBOL  token to receive          (default: market collateral)
//   PRIVILEGE       none | stake | referral             (default: stake)
//   DISCOUNT_INDEX  discount index, or "null"           (default: 5)

const SIDE = (process.env.SIDE || "short").toLowerCase() as "long" | "short";

const PRIV = (process.env.PRIVILEGE || "stake").toLowerCase();
const privilege =
  PRIV === "none" ? Privilege.None : PRIV === "referral" ? Privilege.Referral : Privilege.Stake;
const discountIndex =
  process.env.DISCOUNT_INDEX === "null"
    ? null
    : process.env.DISCOUNT_INDEX
      ? Number(process.env.DISCOUNT_INDEX)
      : 5;

main(async ({ client, poolConfig, wallet }) => {
  const owner = process.env.OWNER ? new PublicKey(process.env.OWNER) : wallet.publicKey;
  const targetSymbol = ENV.targetSymbol;
  const target = custodyBySymbol(poolConfig, targetSymbol);

  // Pick the market for (targetSymbol, SIDE).
  const m = poolConfig.markets.find(
    (x) => x.targetCustody.equals(target.custodyAccount) && SIDE in (x.side as any),
  );
  if (!m) throw new Error(`no ${SIDE.toUpperCase()} market for ${targetSymbol}`);
  const market = m.marketAccount;
  const collateral = poolConfig.custodies.find((c) =>
    c.custodyAccount.equals(m.collateralCustody),
  )!;
  const dispensingSymbol = process.env.DISPENSING_SYMBOL || collateral.symbol;
  console.log(
    `\nmarket   : ${m.marketNameUi}  (${market.toBase58()})\n` +
      `owner    : ${owner.toBase58()}\n` +
      `collateral: ${collateral.symbol}   dispensing: ${dispensingSymbol}`,
  );

  // Read the basket on the ER for the live position.
  const basket: any = await client.erAccounts!.fetchBasket(owner);
  const meta = (basket.positions ?? []).find(
    (p: any) => p.market?.equals?.(market) && !p.position.sizeAmount.isZero(),
  );
  if (!meta) {
    console.log(`\nNo open ${targetSymbol} ${SIDE.toUpperCase()} position in the basket.`);
    return;
  }
  const pos = meta.position;
  const sizeUsd: BN = pos.sizeUsd;
  const sizeAmount: BN = pos.sizeAmount;
  console.log(
    `\nopen position:\n` +
      `  sizeUsd        : ${sizeUsd.toString()}  ($${(sizeUsd.toNumber() / 1e6).toFixed(4)})\n` +
      `  sizeAmount     : ${sizeAmount.toString()} (${pos.sizeDecimals}dp)\n` +
      `  collateralUsd  : ${pos.collateralUsd.toString()}\n` +
      `  entryPrice     : ${pos.entryPrice.price.toString()} e${pos.entryPrice.exponent}`,
  );

  // Resolve the close size → sizeDeltaUsd (USD 6dp), the only input the view takes.
  //   • SIZE_DELTA_USD : used as-is
  //   • SIZE_AMOUNT    : token units → proportional USD (sizeUsd * amt / sizeAmount),
  //                      matching how the program scales a partial close
  //   • neither        : full close
  let sizeDeltaUsd: BN;
  let mode: string;
  if (process.env.SIZE_DELTA_USD) {
    sizeDeltaUsd = new BN(process.env.SIZE_DELTA_USD);
    mode = `partial (SIZE_DELTA_USD=${sizeDeltaUsd.toString()})`;
  } else if (process.env.SIZE_AMOUNT) {
    const amt = new BN(process.env.SIZE_AMOUNT);
    sizeDeltaUsd = sizeUsd.mul(amt).div(sizeAmount);
    mode = `partial (SIZE_AMOUNT=${amt.toString()} of ${sizeAmount.toString()})`;
  } else {
    sizeDeltaUsd = sizeUsd;
    mode = "full";
  }
  // Never request more than the position holds.
  if (sizeDeltaUsd.gt(sizeUsd)) {
    console.log(`  (requested $${(sizeDeltaUsd.toNumber() / 1e6).toFixed(4)} > full — clamping to full)`);
    sizeDeltaUsd = sizeUsd;
    mode = "full (clamped)";
  }

  console.log(
    `\n--- ${mode} close quote: sizeDeltaUsd=${sizeDeltaUsd.toString()} ` +
      `($${(sizeDeltaUsd.toNumber() / 1e6).toFixed(4)}) ---`,
  );
  return client.views.getClosePositionQuoteEr(poolConfig, {
    owner,
    market,
    targetSymbol,
    collateralSymbol: collateral.symbol,
    dispensingSymbol,
    sizeDeltaUsd,
    privilege,
    discountIndex,
  });
});
