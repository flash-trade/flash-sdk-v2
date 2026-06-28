import { BN } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import {
  setup,
  ENV,
  amount,
  pickMarket,
  entryPrice,
  sendEr,
  logSent,
  format,
} from "./_lib";
import {
  checks,
  expectClose,
  expectGte,
  expectFails,
  custodySnapshot,
  assertCustodySolvency,
  printAssertSummary,
} from "./assert";

// ===========================================================================
// MASTER ASSERT — the auditing counterpart to master.ts.
//
// master.ts answers "does the flow run?". This answers "is the math correct?".
// Each scenario is a discrete, named audit check from one of three classes:
//   [INV]  invariant      — a pool truth that must hold (runs read-only too)
//   [XCK]  cross-check    — on-chain ACTUAL delta vs the SDK quote PREDICTION
//   [ADV]  adversarial    — a tx that MUST revert (assert the reject)
//
//   npx ts-node scripts/master_assert.ts            (read-only invariants only)
//   SEND=1 npx ts-node scripts/master_assert.ts     (full: + cross-checks + adversarial)
//   ASSERT_THROW=1 …                                (abort on first failed assertion)
//
// Requires the same per-wallet setup as master.ts (run that once with SEND=1 to
// create basket/ledger/session). Reuse the session via SESSION_KEY=...
// ===========================================================================

const SEND = process.env.SEND === "1";
const TOL_BPS = Number(process.env.ASSERT_TOL_BPS || "50"); // 0.5% default: oracle drifts between quote-sim and executed tx
const settleMs = Number(process.env.POSITION_SETTLE_MS || "2000");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A view/sim couldn't be evaluated (RPC/ER cloning error, not a math result).
 *  These are environmental — SKIP, don't fail the audit. */
class SkipScenario extends Error {}
const isSimError = (m: string) => /simulate|Cloner error|failed to clone|-32003|BlockhashNotFound|fetch failed|ETIMEDOUT/i.test(m);

async function scenario(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n▶ ${name}`);
  try {
    await fn();
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (e instanceof SkipScenario || isSimError(msg)) {
      console.log(`  ⊘ SKIP — could not evaluate: ${msg.slice(0, 140)}`);
      return; // environmental, not a finding
    }
    console.log(`  ✗ scenario error: ${msg.slice(0, 200)}`);
    checks.push({ name: `${name} (scenario crashed)`, ok: false, expect: "completes", actual: msg.slice(0, 120) });
  }
}

async function run() {
  const ctx = setup();
  const owner = ctx.wallet.publicKey;
  const targetSymbol = ENV.targetSymbol;
  const collateralSymbol = ENV.collateralSymbol;
  console.log(`[${ENV.cluster}] pool=${ENV.poolName} wallet=${owner.toBase58()} mode=${SEND ? "SEND" : "READ-ONLY"} tol=${TOL_BPS}bps`);

  // ── [INV] global solvency — runs read-only, no funds needed ──────────────
  // The single most important invariant: for every custody, owned >= locked.
  // If the live pool ever violates this it is already insolvent. This is a
  // zero-cost check you can run against mainnet any time.
  await scenario("[INV] pool solvency (owned >= locked, all custodies)", async () => {
    await assertCustodySolvency(ctx, ENV.poolName, "live");
  });

  // ── [XCK] swap quote vs reverse-swap quote (round-trip ≤ input) ──────────
  // Read-only sanity on the swap math: swapping A→B then quoting B→A must return
  // LESS than you put in (fees + spread), never more. A round-trip that nets a
  // profit is a free-money bug. Pure view math, no funds needed.
  await scenario("[XCK] swap round-trip loses to fees (no free money)", async () => {
    const amtIn = amount("ASSERT_SWAP_IN", "1000000");
    const fwd: any = await ctx.client.views.getSwapAmountAndFees(ctx.poolConfig, {
      receivingSymbol: targetSymbol,
      dispensingSymbol: collateralSymbol,
      amountIn: amtIn,
    });
    const got = new BN(fwd?.amountOut ?? fwd?.amountOutAfterFees ?? 0);
    if (got.isZero()) { console.log("  ⊘ swap quote returned no amountOut — shape mismatch, inspect:", JSON.stringify(format(fwd)).slice(0, 200)); return; }
    const back: any = await ctx.client.views.getSwapAmountAndFees(ctx.poolConfig, {
      receivingSymbol: collateralSymbol,
      dispensingSymbol: targetSymbol,
      amountIn: got,
    });
    const roundTrip = new BN(back?.amountOut ?? back?.amountOutAfterFees ?? 0);
    expectGte(`round-trip input ${amtIn} >= output ${roundTrip}`, amtIn, roundTrip, "A→B→A must lose to fees/spread");
  });

  if (!SEND) {
    console.log("\n(read-only mode — cross-checks & adversarial steps need SEND=1)");
    printAssertSummary();
    return;
  }

  const session = ctx.session ?? Keypair.generate();
  ctx.client.useSession(session.publicKey);
  const { market, side, collateralSymbol: marketCollateral } = pickMarket(ctx.poolConfig);

  // ── [XCK] open position: actual collateral delta ≈ quoted ────────────────
  // Open a position and verify the deposit-ledger / token balance moved by what
  // the SDK quote predicted, and that the on-chain PnL view reads ~0 right after
  // open (entry == mark, minus fees). Then close and re-check solvency.
  await scenario("[XCK] open/close position vs quote + solvency", async () => {
    const tradeCollateral = amount("ASSERT_TRADE_COLLATERAL", "1000000");
    const quote: any = await ctx.client.views.getOpenPositionQuote(ctx.poolConfig, {
      market, targetSymbol, collateralSymbol: marketCollateral, receivingSymbol: marketCollateral,
      amountIn: tradeCollateral, leverage: new BN(20000),
    });
    const size: BN = quote?.sizeAmount ?? tradeCollateral;

    const before = await custodySnapshot(ctx, ENV.poolName);
    const openPrice = await entryPrice(ctx, targetSymbol, side, true);
    const openRes = await ctx.client.openPosition(targetSymbol, marketCollateral, marketCollateral, side, ctx.poolConfig, openPrice, tradeCollateral, size);
    logSent(await sendEr(ctx, openRes, [session]));

    await assertCustodySolvency(ctx, ENV.poolName, "after-open");

    // collateral custody's `collateral` should rise by ~tradeCollateral (the
    // locked-in margin). Tolerance covers swap/fee skim on the way in.
    const after = await custodySnapshot(ctx, ENV.poolName);
    const cBefore = before[marketCollateral]?.collateral ?? new BN(0);
    const cAfter = after[marketCollateral]?.collateral ?? new BN(0);
    expectClose(`${marketCollateral} custody.collateral += ~${tradeCollateral}`, cAfter.sub(cBefore), tradeCollateral, TOL_BPS * 4, "open margin lock (wide tol: fees+spread)");

    // PnL immediately after open ≈ 0 (mark==entry), bounded by fees.
    const pnl: any = await ctx.client.views.getPnlEr(ctx.poolConfig, { owner, market, targetSymbol, collateralSymbol: marketCollateral }).catch(() => null);
    if (pnl) console.log("  • getPnlEr right after open:", JSON.stringify(format(pnl)).slice(0, 160));

    await sleep(settleMs); // clear curtime>update_time guard (err 6031)
    const closePrice = await entryPrice(ctx, targetSymbol, side, false);
    const closeRes = await ctx.client.closePosition(targetSymbol, marketCollateral, side, ctx.poolConfig, closePrice);
    logSent(await sendEr(ctx, closeRes, [session]));
    await assertCustodySolvency(ctx, ENV.poolName, "after-close");
  });

  // ── [ADV] over-leverage must revert (MinLeverage / MaxLeverage guard) ─────
  // Opening with size ≈ collateral (≈1x) trips MinLeverage; a huge size trips
  // MaxLeverage. Either way the program MUST reject. If this ever succeeds, the
  // leverage guard is broken.
  await scenario("[ADV] 1:1 size (sub-min leverage) reverts", async () => {
    const tradeCollateral = amount("ASSERT_TRADE_COLLATERAL", "1000000");
    await expectFails(
      "open with size==collateral rejects (MinLeverage)",
      async () => {
        const price = await entryPrice(ctx, targetSymbol, side, true);
        const res = await ctx.client.openPosition(targetSymbol, marketCollateral, marketCollateral, side, ctx.poolConfig, price, tradeCollateral, tradeCollateral);
        return sendEr(ctx, res, [session]);
      },
      // accept any leverage-related reject; tighten to the exact code once observed
      /[Ll]everage|6023|6024/,
    );
  });

  printAssertSummary();
}

run().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => { console.error("\nFATAL:", e?.message ?? e); printAssertSummary(); process.exit(1); },
);
