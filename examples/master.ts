import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  setup,
  ENV,
  amount,
  custodyBySymbol,
  pickMarket,
  entryPrice,
  sendBase,
  sendEr,
  pollVisibleOnEr,
  pollClosedOnBase,
  logSent,
  format,
  type Ctx,
} from "./_lib";
import {
  findBasketAddress,
  findUserDepositLedgerAddress,
  findTradeVaultAddress,
  findSessionTokenAddress,
  findCompDepositReceiptAddress,
  findCompWithdrawReceiptAddress,
  findStakingDepositReceiptAddress,
  findStakingWithdrawReceiptAddress,
  findWithdrawalEscrowReceiptAddress,
  DELEGATION_PROGRAM_ID,
} from "@flash_trade/flash-sdk-v2";

// ===========================================================================
// MASTER end-to-end runner — exercises the whole protocol surface in serial:
//   reads/views → account setup → compounding LP → staked LP → trade → withdraw,
// interleaving the relevant view functions at each stage. Reuses the same client
// methods the individual scripts call (shared process → one session keypair).
//
// DRY-RUN by default (builds + runs reads/views, mutating steps report only).
// SEND=1 executes the full chain of txs. Each step is wrapped so a failure is
// recorded (PASS/FAIL/SKIP) and the run continues; a summary table prints at the
// end. STOP_ON_FAIL=1 aborts on the first non-optional failure.
//
//   npx ts-node scripts/master.ts                 (dry-run)
//   SEND=1 npx ts-node scripts/master.ts          (full e2e)
//   SEND=1 SESSION_KEY=~/session.json npx ts-node scripts/master.ts  (reuse a session)
// Knobs: TARGET_SYMBOL (SOL), COLLATERAL_SYMBOL (USDC), DEPOSIT_AMOUNT, LP_AMOUNT,
//        STAKE_AMOUNT, TRADE_COLLATERAL, TRADE_SIZE, WITHDRAW_AMOUNT.
// ===========================================================================

const SEND = process.env.SEND === "1";
const collateralSymbol = ENV.collateralSymbol; // USDC
const targetSymbol = ENV.targetSymbol; // SOL

const depositAmount = amount("DEPOSIT_AMOUNT", "3000000"); // USDC; headroom for trade + swap sections
const lpAmount = amount("LP_AMOUNT", "1000000");
const stakeAmount = amount("STAKE_AMOUNT", "1000000");
const tradeCollateral = amount("TRADE_COLLATERAL", "1000000");
const tradeSize = amount("TRADE_SIZE", "1000000");
const withdrawAmount = amount("WITHDRAW_AMOUNT", "500000");
// close/decrease require `curtime > position.update_time` (close_position_er.rs):
// you can't reduce/close a position in the SAME on-chain second it was last
// opened/increased. Wait out the 1s boundary before those ops.
const settleMs = Number(process.env.POSITION_SETTLE_MS || "2000");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- step runner ------------------------------------------------------------

type Status = "PASS" | "FAIL" | "SKIP";
interface StepResult {
  section: string;
  name: string;
  status: Status;
  ms: number;
  detail?: string;
}
const results: StepResult[] = [];
let curSection = "";

/** Section header + a one-line "what & why" so the log reads as a walkthrough. */
const banner = (s: string, why: string) => {
  curSection = s;
  console.log(`\n${"═".repeat(72)}\n▌ ${s}\n│ ${why}\n${"═".repeat(72)}`);
};
/** Indented explanation line — teaches the reader what the next step does/why. */
const explain = (msg: string) => console.log(`  ┄ ${msg}`);
const SKIP = (reason: string) => ({ __skip: reason });

async function step(
  name: string,
  fn: () => Promise<unknown>,
  opts: { optional?: boolean } = {},
): Promise<unknown> {
  console.log(`\n▶ ${name}`);
  const t0 = Date.now();
  try {
    const r = await fn();
    if (r && typeof r === "object" && "__skip" in (r as any)) {
      const reason = (r as any).__skip as string;
      results.push({ section: curSection, name, status: "SKIP", ms: 0, detail: reason });
      console.log(`  ⊘ SKIP — ${reason}`);
      return undefined;
    }
    results.push({ section: curSection, name, status: "PASS", ms: Date.now() - t0 });
    console.log(`  ✓ PASS (${Date.now() - t0}ms)`);
    return r;
  } catch (e: any) {
    const detail = String(e?.message ?? e).slice(0, 160);
    results.push({ section: curSection, name, status: "FAIL", ms: Date.now() - t0, detail });
    console.log(`  ✗ FAIL — ${detail}`);
    if (e?.signature) console.log(`    sig: ${e.signature}`);
    if (!opts.optional && process.env.STOP_ON_FAIL === "1") throw e;
    return undefined;
  }
}

/** Run a read/view and print a trimmed result. Always optional. A fn that
 *  returns SKIP(...) is passed through (e.g. a view that needs an open position). */
async function view(name: string, fn: () => Promise<unknown>): Promise<void> {
  await step(
    name,
    async () => {
      const r = await fn();
      if (r && typeof r === "object" && "__skip" in (r as any)) return r;
      const s = JSON.stringify(format(r));
      console.log(`  → ${s.length > 220 ? s.slice(0, 220) + "…" : s}`);
      return r;
    },
    { optional: true },
  );
}

const accountExists = async (ctx: Ctx, pk: PublicKey) =>
  !!(await ctx.client.provider.connection.getAccountInfo(pk).catch(() => null));

// --- LP flow helpers (the same 4-phase client-driven flow as the lp/ scripts) -

async function compoundingAdd(ctx: Ctx, symbol: string, amt: BN) {
  const owner = ctx.wallet.publicKey;
  const inC = custodyBySymbol(ctx.poolConfig, symbol);
  const funding = getAssociatedTokenAddressSync(inC.mintKey, owner);
  const compAta = getAssociatedTokenAddressSync(ctx.poolConfig.compoundingTokenMint, owner);
  const [receipt] = findCompDepositReceiptAddress(owner, inC.mintKey, ctx.client.programId);
  const res = await ctx.client.addCompoundingLiquidityWithAction(ctx.poolConfig, {
    inSymbol: symbol,
    fundingAccount: funding,
    compoundingTokenAccount: compAta,
    amountIn: amt,
    minCompoundingAmountOut: new BN(0),
    queueErAction: false,
  });
  const createAta = createAssociatedTokenAccountIdempotentInstruction(
    owner,
    compAta,
    owner,
    ctx.poolConfig.compoundingTokenMint,
  );
  const sent = logSent(await sendBase(ctx, { ...res, instructions: [createAta, ...res.instructions] }));
  if (!("signature" in sent)) return SKIP("dry-run");
  await pollVisibleOnEr(ctx, receipt);
  const payer = Keypair.generate();
  const erRes = await ctx.client.addCompoundingLiquidityEr(ctx.poolConfig, {
    inSymbol: symbol,
    fundingAccount: funding,
    compoundingTokenAccount: compAta,
    payer: payer.publicKey,
  });
  logSent(await sendEr(ctx, erRes, [payer]));
  await pollClosedOnBase(ctx, receipt);
  return { settled: true };
}

async function compoundingRemove(ctx: Ctx, symbol: string, amt: BN) {
  const owner = ctx.wallet.publicKey;
  const outC = custodyBySymbol(ctx.poolConfig, symbol);
  const receiving = getAssociatedTokenAddressSync(outC.mintKey, owner);
  const compAta = getAssociatedTokenAddressSync(ctx.poolConfig.compoundingTokenMint, owner);
  const [receipt] = findCompWithdrawReceiptAddress(owner, outC.mintKey, ctx.client.programId);
  const res = await ctx.client.removeCompoundingLiquidityWithAction(ctx.poolConfig, {
    outSymbol: symbol,
    receivingAccount: receiving,
    compoundingTokenAccount: compAta,
    compoundingAmountIn: amt,
    minAmountOut: new BN(0),
    queueErAction: false,
  });
  const createAta = createAssociatedTokenAccountIdempotentInstruction(owner, receiving, owner, outC.mintKey);
  const sent = logSent(await sendBase(ctx, { ...res, instructions: [createAta, ...res.instructions] }));
  if (!("signature" in sent)) return SKIP("dry-run");
  await pollVisibleOnEr(ctx, receipt);
  const payer = Keypair.generate();
  const erRes = await ctx.client.removeCompoundingLiquidityEr(ctx.poolConfig, {
    outSymbol: symbol,
    receivingAccount: receiving,
    compoundingTokenAccount: compAta,
    payer: payer.publicKey,
  });
  logSent(await sendEr(ctx, erRes, [payer]));
  await pollClosedOnBase(ctx, receipt);
  return { settled: true };
}

async function stakedAdd(ctx: Ctx, symbol: string, amt: BN) {
  const owner = ctx.wallet.publicKey;
  const inC = custodyBySymbol(ctx.poolConfig, symbol);
  const funding = getAssociatedTokenAddressSync(inC.mintKey, owner);
  const [receipt] = findStakingDepositReceiptAddress(owner, inC.mintKey, ctx.client.programId);
  const res = await ctx.client.addLiquidityAndStakeWithAction(ctx.poolConfig, {
    inSymbol: symbol,
    fundingAccount: funding,
    amountIn: amt,
    minLpAmountOut: new BN(0),
    queueErAction: false,
  });
  const sent = logSent(await sendBase(ctx, res));
  if (!("signature" in sent)) return SKIP("dry-run");
  await pollVisibleOnEr(ctx, receipt);
  const payer = Keypair.generate();
  const erRes = await ctx.client.addLiquidityAndStakeEr(ctx.poolConfig, {
    inSymbol: symbol,
    fundingAccount: funding,
    payer: payer.publicKey,
  });
  logSent(await sendEr(ctx, erRes, [payer]));
  await pollClosedOnBase(ctx, receipt);
  return { settled: true };
}

async function stakedRemove(ctx: Ctx, symbol: string, amt: BN) {
  const owner = ctx.wallet.publicKey;
  const outC = custodyBySymbol(ctx.poolConfig, symbol);
  const receiving = getAssociatedTokenAddressSync(outC.mintKey, owner);
  const [receipt] = findStakingWithdrawReceiptAddress(owner, outC.mintKey, ctx.client.programId);
  const res = await ctx.client.removeLiquidityWithAction(ctx.poolConfig, {
    outSymbol: symbol,
    receivingAccount: receiving,
    unstakeAmount: amt,
    minAmountOut: new BN(0),
    queueErAction: false,
  });
  const sent = logSent(await sendBase(ctx, res));
  if (!("signature" in sent)) return SKIP("dry-run");
  await pollVisibleOnEr(ctx, receipt);
  const payer = Keypair.generate();
  const erRes = await ctx.client.removeLiquidityEr(ctx.poolConfig, {
    outSymbol: symbol,
    receivingAccount: receiving,
    payer: payer.publicKey,
  });
  logSent(await sendEr(ctx, erRes, [payer]));
  await pollClosedOnBase(ctx, receipt);
  return { settled: true };
}

// --- trade lifecycle helper (parameterized: side + optional collateral swaps) -

/** Find the market for (targetSymbol, side) and its collateral token. Markets are
 *  per-side: e.g. SOL long → SOL collateral, SOL short → USDC collateral. */
function marketBySide(ctx: Ctx, targetSymbol: string, wantSide: "long" | "short") {
  const pc = ctx.poolConfig;
  const target = custodyBySymbol(pc, targetSymbol);
  const m = pc.markets.find(
    (x: any) =>
      x.targetCustody.equals(target.custodyAccount) && Object.keys(x.side)[0] === wantSide,
  );
  if (!m) throw new Error(`no ${wantSide} market for ${targetSymbol}`);
  const collateral = pc.custodies.find((c: any) => c.custodyAccount.equals(m.collateralCustody))!;
  return { market: m.marketAccount as PublicKey, side: (m as any).side, collateralSymbol: collateral.symbol };
}

/**
 * Run one full position lifecycle for a given side:
 *   ensure flat → open (size from quote @2x) → [swap add/remove collateral] → close.
 * When `swap.fundSymbol` differs from the market's collateral token, the
 * add/removeCollateral ops CROSS custodies and the program swaps under the hood
 * (e.g. a BTC-collateral position topped up with USDC → USDC→BTC swap).
 */
async function runTradeLifecycle(
  ctx: Ctx,
  session: Keypair,
  opts: {
    label: string;
    targetSymbol: string;
    wantSide: "long" | "short";
    amountIn: BN; // collateral-token units fed to the open quote
    swap?: { fundSymbol: string; addAmount: BN; removeUsd: BN };
  },
) {
  const owner = ctx.wallet.publicKey;
  const { label, targetSymbol, wantSide, amountIn, swap } = opts;
  const { market, side, collateralSymbol: collat } = marketBySide(ctx, targetSymbol, wantSide);
  explain(
    `${label}: ${wantSide} market, collateral=${collat}` +
      (swap ? `, collateral ops funded/paid in ${swap.fundSymbol} → ${swap.fundSymbol === collat ? "no swap" : "SWAP"}` : ""),
  );

  // Start flat in this market (re-runnable).
  await step(`${label}: ensure flat`, async () => {
    const basket: any = await ctx.client.erAccounts!.fetchBasket(owner).catch(() => null);
    const active = (basket?.positions ?? []).filter(
      (p: any) => !p.position.sizeAmount.isZero() && p.position.market?.equals?.(market),
    );
    if (!active.length) return SKIP("already flat");
    await sleep(settleMs);
    const price = await entryPrice(ctx, targetSymbol, side, false);
    const res = await ctx.client.closePosition(targetSymbol, collat, side, ctx.poolConfig, price);
    const sent = logSent(await sendEr(ctx, res, [session]));
    return "signature" in sent ? sent : SKIP("dry-run");
  }, { optional: true });

  const quote: any = await step(`${label}: quote open @2x`, () =>
    ctx.client.views.getOpenPositionQuote(ctx.poolConfig, {
      market,
      targetSymbol,
      collateralSymbol: collat,
      receivingSymbol: collat,
      amountIn,
      leverage: new BN(20000),
    }),
  );
  const size: BN = quote?.sizeAmount ?? amountIn;

  const opened = await step(`${label}: open ${wantSide}`, async () => {
    const price = await entryPrice(ctx, targetSymbol, side, true);
    const res = await ctx.client.openPosition(targetSymbol, collat, collat, side, ctx.poolConfig, price, amountIn, size);
    const sent = logSent(await sendEr(ctx, res, [session]));
    return "signature" in sent ? sent : SKIP("dry-run");
  });
  const isOpen = !!opened;

  if (swap) {
    const tag = swap.fundSymbol === collat ? "" : ` [${swap.fundSymbol}↔${collat} swap]`;
    await step(`${label}: addCollateral via ${swap.fundSymbol}${tag}`, async () => {
      if (!isOpen) return SKIP("no open position");
      const res = await ctx.client.addCollateral(targetSymbol, collat, side, ctx.poolConfig, swap.addAmount, swap.fundSymbol);
      const sent = logSent(await sendEr(ctx, res, [session]));
      return "signature" in sent ? sent : SKIP("dry-run");
    }, { optional: true });
    await step(`${label}: removeCollateral to ${swap.fundSymbol}${tag}`, async () => {
      if (!isOpen) return SKIP("no open position");
      const res = await ctx.client.removeCollateral(targetSymbol, collat, side, ctx.poolConfig, swap.removeUsd, swap.fundSymbol);
      const sent = logSent(await sendEr(ctx, res, [session]));
      return "signature" in sent ? sent : SKIP("dry-run");
    }, { optional: true });
  }

  await step(`${label}: close ${wantSide}`, async () => {
    if (!isOpen) return SKIP("no open position");
    await sleep(settleMs); // clear the `curtime > update_time` guard (err 6031)
    const price = await entryPrice(ctx, targetSymbol, side, false);
    const res = await ctx.client.closePosition(targetSymbol, collat, side, ctx.poolConfig, price);
    const sent = logSent(await sendEr(ctx, res, [session]));
    return "signature" in sent ? sent : SKIP("dry-run");
  });
}

// --- main flow --------------------------------------------------------------

async function run() {
  const ctx = setup();
  const owner = ctx.wallet.publicKey;
  console.log(
    `[${ENV.cluster}] pool=${ENV.poolName} wallet=${owner.toBase58()} mode=${SEND ? "SEND" : "DRY-RUN"}`,
  );

  // ── Orientation for a first-time reader ─────────────────────────────────
  // This protocol runs on TWO layers:
  //   • BASE chain (Solana devnet)  — where accounts live and settle.
  //   • EPHEMERAL ROLLUP (ER)       — a MagicBlock validator that executes the
  //                                   heavy logic fast, then commits back to base.
  // Most user actions are a SMALL base tx that DELEGATES a "receipt" PDA to the
  // ER, after which the ER runs the real work (`*_er`) and settle closes
  // the receipt on base. These scripts drive that themselves (no keeper):
  //     base tx (delegate receipt) → poll receipt onto ER → `*_er` commit → poll close
  // Trades are signed by a SESSION key (registered once) so you don't sign every
  // ER tx with the owner. Funds for trading live in a per-wallet "deposit ledger";
  // LP draws straight from your wallet's token account. DRY-RUN builds everything
  // but writes nothing; SEND=1 executes the whole chain. Each step is PASS/FAIL/
  // SKIP and a summary prints at the end.
  console.log(
    "\nFLOW:  setup (basket/ledger/vault/session/deposit) →" +
      " compounding LP → staked LP → trade lifecycle → withdraw" +
      "\n       (relevant view/quote functions are called at each stage)",
  );

  const { market, side, collateralSymbol: marketCollateral } = pickMarket(ctx.poolConfig);
  console.log(
    `MARKET: ${targetSymbol} ${Object.keys(side)[0]} · collateral=${marketCollateral} · deposit/LP token=${collateralSymbol}`,
  );

  // ── SECTION 1 — protocol reads + global views ──────────────────────────
  // Pure reads: confirm the pool is reachable and snapshot prices/fees BEFORE we
  // touch anything. Views simulate on the ER and never write.
  banner("1 · READS + GLOBAL VIEWS", "fetch on-chain state + pool-level prices/quotes (no writes)");
  await view("read perpetuals", () => ctx.client.accounts.fetchPerpetuals());
  await view("read pool", () => ctx.client.accounts.fetchPool(ENV.poolName));
  await view("read custodies", () => ctx.client.accounts.fetchAllCustodies(ENV.poolName));
  await view("view getLpTokenPrice", () => ctx.client.views.getLpTokenPrice(ctx.poolConfig));
  await view("view getCompoundingTokenPrice", () =>
    ctx.client.views.getCompoundingTokenPrice(ctx.poolConfig),
  );
  await view("view getCompoundingTokenData", () =>
    ctx.client.views.getCompoundingTokenData(ctx.poolConfig),
  );
  await view("view getSwapAmountAndFees", () =>
    ctx.client.views.getSwapAmountAndFees(ctx.poolConfig, {
      receivingSymbol: targetSymbol,
      dispensingSymbol: collateralSymbol,
      amountIn: lpAmount,
    }),
  );

  // ── SECTION 2 — account setup (idempotent) ─────────────────────────────
  // One-time per-wallet plumbing. Every step checks if its account already
  // exists and SKIPs if so, so this section is safe to re-run.
  banner("2 · ACCOUNT SETUP", "create the per-wallet accounts trading/LP need (idempotent)");
  explain("basket = your account container; deposit ledger = your tradable balance;");
  explain("trade vault = per-token pool vault; session = key that signs ER trades;");
  explain("delegateBasket = hand the basket to the ER; depositDirect = fund the ledger.");
  await step("initializeBasket", async () => {
    const [basket] = findBasketAddress(owner, ctx.client.programId);
    if (await accountExists(ctx, basket)) return SKIP("basket exists");
    return logSent(await sendBase(ctx, await ctx.client.initializeBasket()));
  });
  await step("initializeUserDepositLedger", async () => {
    const [ledger] = findUserDepositLedgerAddress(owner, ctx.client.programId);
    if (await accountExists(ctx, ledger)) return SKIP("ledger exists");
    return logSent(await sendBase(ctx, await ctx.client.initializeUserDepositLedger()));
  });
  await step("initTradeVault", async () => {
    const mint = custodyBySymbol(ctx.poolConfig, collateralSymbol).mintKey;
    const [vault] = findTradeVaultAddress(mint, ctx.client.programId);
    if (await accountExists(ctx, vault)) return SKIP("trade vault exists");
    return logSent(await sendBase(ctx, await ctx.client.initTradeVault(mint)));
  });
  await step("delegateBasket", async () => {
    const [basket] = findBasketAddress(owner, ctx.client.programId);
    const info = await ctx.client.provider.connection.getAccountInfo(basket).catch(() => null);
    if (info?.owner.equals(DELEGATION_PROGRAM_ID)) return SKIP("basket already delegated");
    return logSent(
      await sendBase(
        ctx,
        await ctx.client.delegateBasket(owner),
      ),
    );
  });

  // Session: reuse SESSION_KEY if given, else generate one in-memory and register.
  const session = ctx.session ?? Keypair.generate();
  await step("createSession", async () => {
    const [token] = findSessionTokenAddress(ctx.client.programId, session.publicKey, owner);
    if (await accountExists(ctx, token)) return SKIP("session token exists");
    const res = await ctx.client.createSession(session.publicKey);
    return logSent(await sendBase(ctx, { ...res, additionalSigners: [session] }));
  });
  ctx.client.useSession(session.publicKey);
  console.log(`  • session=${session.publicKey.toBase58()} (active)`);

  await step("depositDirect", async () => {
    const mint = custodyBySymbol(ctx.poolConfig, collateralSymbol).mintKey;
    return logSent(await sendBase(ctx, await ctx.client.depositDirect(mint, depositAmount)));
  });

  // ── SECTION 3 — compounding liquidity (+views) ─────────────────────────
  // Compounding LP mints "sFLP" — a token whose value auto-grows as fees accrue
  // (no separate staking step). add → wait → remove, each a full ER round-trip.
  banner("3 · COMPOUNDING LIQUIDITY", "add then remove auto-compounding sFLP (4-phase ER flow)");
  explain("quote first (amount/fee view), then add, then quote the remove, then remove.");
  explain("each add/remove = base delegate → poll to ER → `_er` commit → settle on base.");
  await view("view getAddCompoundingLiquidityAmountAndFee", () =>
    ctx.client.views.getAddCompoundingLiquidityAmountAndFee(ctx.poolConfig, {
      inSymbol: collateralSymbol,
      amountIn: lpAmount,
    }),
  );
  await step("addCompoundingLiquidity", () => compoundingAdd(ctx, collateralSymbol, lpAmount));
  await view("view getRemoveCompoundingLiquidityAmountAndFee", () =>
    ctx.client.views.getRemoveCompoundingLiquidityAmountAndFee(ctx.poolConfig, {
      outSymbol: collateralSymbol,
      compoundingAmountIn: lpAmount,
    }),
  );
  await step(
    "removeCompoundingLiquidity",
    () => compoundingRemove(ctx, collateralSymbol, lpAmount),
    { optional: true },
  );

  // ── SECTION 4 — staked liquidity (+views) ──────────────────────────────
  // Staked LP mints FLP and stakes it for rewards. Same 4-phase ER flow. NOTE:
  // freshly-staked LP is `pending_activation`, so an immediate unstake usually
  // reverts — `removeLiquidity` is marked optional and expected to no-op here.
  banner("4 · STAKED LIQUIDITY", "add then (try to) remove staked FLP (4-phase ER flow)");
  explain("add stakes FLP for rewards; remove unstakes+burns. Fresh stake is");
  explain("pending-activation, so the immediate remove often reverts (optional step).");
  await view("view getAddLiquidityAmountAndFee", () =>
    ctx.client.views.getAddLiquidityAmountAndFee(ctx.poolConfig, {
      symbol: collateralSymbol,
      amountIn: stakeAmount,
    }),
  );
  await step("addLiquidityAndStake", () => stakedAdd(ctx, collateralSymbol, stakeAmount));
  await view("view getRemoveLiquidityAmountAndFee", () =>
    ctx.client.views.getRemoveLiquidityAmountAndFee(ctx.poolConfig, {
      symbol: collateralSymbol,
      lpAmountIn: stakeAmount,
    }),
  );
  // Freshly-staked LP is pending_activation; an immediate unstake may revert.
  await step("removeLiquidity", () => stakedRemove(ctx, collateralSymbol, stakeAmount), {
    optional: true,
  });

  // ── SECTION 5 — trade lifecycle (+views) ───────────────────────────────
  // Full position lifecycle on the ER, signed by the session key. Collateral is
  // pulled from the deposit ledger funded in section 2. We open, inspect with
  // every position-level view, mutate (add/remove collateral, in/decrease size),
  // then close.
  banner("5 · TRADE LIFECYCLE", "open → inspect (views) → adjust → close a position (ER, session-signed)");
  explain("quotes first, then open_position; while open, every position view works;");
  explain("then add/remove collateral + in/decrease size; finally close_position.");
  await view("view getEntryPriceAndFee", () =>
    ctx.client.views.getEntryPriceAndFee(ctx.poolConfig, {
      market,
      targetSymbol,
      collateralSymbol: marketCollateral,
      collateral: tradeCollateral,
      size: tradeSize,
      side,
    }),
  );
  // Idempotency: a leftover open position (e.g. from an aborted earlier run)
  // blocks a fresh open with `InvalidArgument`. Close any existing position in
  // this market first so the section starts flat and is safely re-runnable.
  await step(
    "ensure flat (close any leftover position)",
    async () => {
      const basket: any = await ctx.client.erAccounts!.fetchBasket(owner).catch(() => null);
      const active = (basket?.positions ?? []).filter(
        (p: any) => !p.position.sizeAmount.isZero() && p.position.market?.equals?.(market),
      );
      if (!active.length) return SKIP("already flat");
      const price = await entryPrice(ctx, targetSymbol, side, false);
      const res = await ctx.client.closePosition(targetSymbol, marketCollateral, side, ctx.poolConfig, price);
      const sent = logSent(await sendEr(ctx, res, [session]));
      return "signature" in sent ? sent : SKIP("dry-run");
    },
    { optional: true },
  );

  // Derive the position SIZE from the quote at a target leverage. Passing
  // size==collateral (≈1x) trips MinLeverage (err 6023); the quote gives the
  // size that hits ~2x for our collateral, so the open is valid.
  explain("size is derived from the quote at ~2x — a 1:1 size/collateral trips MinLeverage.");
  const tradeQuote: any = await step("quote open position (derive size @2x)", () =>
    ctx.client.views.getOpenPositionQuote(ctx.poolConfig, {
      market,
      targetSymbol,
      collateralSymbol: marketCollateral,
      receivingSymbol: marketCollateral,
      amountIn: tradeCollateral,
      leverage: new BN(20000), // 2.0000 (BPS_DECIMALS=4)
    }),
  );
  const openSize: BN = tradeQuote?.sizeAmount ?? tradeSize;
  const sizeStep = openSize.divn(4); // small delta for in/decrease-size steps

  const opened = await step("openPosition", async () => {
    const price = await entryPrice(ctx, targetSymbol, side, true);
    const res = await ctx.client.openPosition(
      targetSymbol,
      marketCollateral,
      marketCollateral,
      side,
      ctx.poolConfig,
      price,
      tradeCollateral,
      openSize,
    );
    const sent = logSent(await sendEr(ctx, res, [session]));
    return "signature" in sent ? sent : SKIP("dry-run");
  });
  // Everything below needs a live position. In DRY-RUN (or if the open failed)
  // we cleanly SKIP the dependents rather than spamming "needs position" errors.
  const positionOpen = !!opened;

  // Inspect the live position. IMPORTANT: this MagicBlock/ER pool stores positions
  // INSIDE the basket (open_position_er has no standalone position account), so the
  // BASE per-position views — getPositionData / getPnl / getExit* / getLiquidation* /
  // get{Add,Remove,Close}Quote — which derive a standalone findPositionAddress PDA,
  // do NOT apply to this pool (they'd 3012 on a non-existent account). Use either:
  //   • the basket read (below) for raw position state, or
  //   • the *Er* view variants (getPnlEr / getExitPriceAndFeeEr / getLiquidation*Er /
  //     get{Add,Remove,Close}QuoteEr) — these read the delegated basket and DO work
  //     here (demonstrated right after the basket read).
  explain(
    positionOpen
      ? "ER positions live in the basket — reading it, then the *Er position views (the base ones are for the non-ER model)"
      : "no open position → basket read skipped",
  );
  await step(
    "read basket (live positions)",
    async () => {
      if (!positionOpen) return SKIP("no open position");
      const basket: any = await ctx.client.erAccounts!.fetchBasket(owner);
      const active = (basket.positions ?? []).filter((p: any) => !p.position.sizeAmount.isZero());
      console.log(`  → ${active.length} active position(s) in basket`);
      return active.map((p: any) => format(p.position));
    },
    { optional: true },
  );

  // ER position-level views: the basket-reading *Er variants (vs. the base PDA
  // views above). The close quote needs a size in USD — pull the live full
  // sizeUsd off the basket and quote a FULL close (sizeDeltaUsd = sizeUsd).
  const erPosViewArgs = { owner, market, targetSymbol, collateralSymbol: marketCollateral };
  await view("view getPnlEr", async () =>
    positionOpen ? ctx.client.views.getPnlEr(ctx.poolConfig, erPosViewArgs) : SKIP("no open position"),
  );
  await view("view getExitPriceAndFeeEr", async () =>
    positionOpen ? ctx.client.views.getExitPriceAndFeeEr(ctx.poolConfig, erPosViewArgs) : SKIP("no open position"),
  );
  await view("view getLiquidationPriceEr", async () =>
    positionOpen ? ctx.client.views.getLiquidationPriceEr(ctx.poolConfig, erPosViewArgs) : SKIP("no open position"),
  );
  await view("view getClosePositionQuoteEr (full close)", async () => {
    if (!positionOpen) return SKIP("no open position");
    const basket: any = await ctx.client.erAccounts!.fetchBasket(owner);
    const meta = (basket.positions ?? []).find(
      (p: any) => p.market?.equals?.(market) && !p.position.sizeAmount.isZero(),
    );
    if (!meta) return SKIP("position not in basket");
    return ctx.client.views.getClosePositionQuoteEr(ctx.poolConfig, {
      ...erPosViewArgs,
      dispensingSymbol: marketCollateral,
      sizeDeltaUsd: meta.position.sizeUsd, // full close
    });
  });

  await step("addCollateral", async () => {
    if (!positionOpen) return SKIP("no open position");
    const res = await ctx.client.addCollateral(targetSymbol, marketCollateral, side, ctx.poolConfig, tradeCollateral);
    const sent = logSent(await sendEr(ctx, res, [session]));
    return "signature" in sent ? sent : SKIP("dry-run");
  }, { optional: true });

  await step("increasePositionSize", async () => {
    if (!positionOpen) return SKIP("no open position");
    const price = await entryPrice(ctx, targetSymbol, side, true);
    const res = await ctx.client.increasePositionSize(targetSymbol, marketCollateral, side, ctx.poolConfig, price, sizeStep, tradeCollateral);
    const sent = logSent(await sendEr(ctx, res, [session]));
    return "signature" in sent ? sent : SKIP("dry-run");
  }, { optional: true });

  await step("decreasePositionSize", async () => {
    if (!positionOpen) return SKIP("no open position");
    await sleep(settleMs); // clear the `curtime > update_time` guard (err 6031)
    const price = await entryPrice(ctx, targetSymbol, side, false);
    const res = await ctx.client.decreasePositionSize(targetSymbol, marketCollateral, side, ctx.poolConfig, price, sizeStep);
    const sent = logSent(await sendEr(ctx, res, [session]));
    return "signature" in sent ? sent : SKIP("dry-run");
  }, { optional: true });

  await step("removeCollateral", async () => {
    if (!positionOpen) return SKIP("no open position");
    const res = await ctx.client.removeCollateral(targetSymbol, marketCollateral, side, ctx.poolConfig, tradeCollateral);
    const sent = logSent(await sendEr(ctx, res, [session]));
    return "signature" in sent ? sent : SKIP("dry-run");
  }, { optional: true });

  await step("closePosition", async () => {
    if (!positionOpen) return SKIP("no open position");
    await sleep(settleMs); // clear the `curtime > update_time` guard (err 6031)
    const price = await entryPrice(ctx, targetSymbol, side, false);
    const res = await ctx.client.closePosition(targetSymbol, marketCollateral, side, ctx.poolConfig, price);
    const sent = logSent(await sendEr(ctx, res, [session]));
    return "signature" in sent ? sent : SKIP("dry-run");
  });

  // ── SECTION 5b — swaps + both sides ────────────────────────────────────
  // Demonstrates (a) the OTHER side (long, in addition to section 5's short) and
  // (b) collateral ops that CROSS custodies → the program swaps. We use BTC: a
  // BTC-long position is BTC-collateral, so funding add/removeCollateral in USDC
  // makes a USDC↔BTC swap; the BTC-short shows the opposite side.
  banner("5b · SWAPS + BOTH SIDES", "open/close both sides; cross-custody collateral ops (swaps)");
  explain("a collateral op whose funding/dispensing token ≠ the position's collateral triggers a swap.");
  const swapTarget = process.env.SWAP_TARGET || "BTC";
  const swapDeposit = amount("SWAP_DEPOSIT", "300000"); // collateral for the long side

  await step(`depositDirect ${swapTarget} (long-side collateral)`, async () => {
    const mint = custodyBySymbol(ctx.poolConfig, swapTarget).mintKey;
    return logSent(await sendBase(ctx, await ctx.client.depositDirect(mint, swapDeposit)));
  });
  // Swap-pricing preview. NOTE: this pool's BTC custody enforces an amount limit,
  // so a USDC→BTC quote (receiving BTC) trips CustodyAmountLimit (6024); we quote
  // the BTC→USDC direction instead. The real swaps are exercised by the
  // cross-custody add/removeCollateral steps below.
  await view(`view getSwapAmountAndFees (${swapTarget}→${collateralSymbol})`, () =>
    ctx.client.views.getSwapAmountAndFees(ctx.poolConfig, {
      receivingSymbol: collateralSymbol,
      dispensingSymbol: swapTarget,
      amountIn: amount("SWAP_QUOTE_AMOUNT_IN", "10000"),
    }),
  );

  // LONG side, collateral = swapTarget (BTC); add/remove collateral funded in USDC
  // → USDC↔BTC swaps. Amounts are tiny relative to the position, so leverage is fine.
  await runTradeLifecycle(ctx, session, {
    label: `${swapTarget} long+swap`,
    targetSymbol: swapTarget,
    wantSide: "long",
    amountIn: amount("SWAP_LONG_AMOUNT_IN", "100000"),
    swap: {
      fundSymbol: collateralSymbol, // USDC (≠ BTC collateral → swap)
      addAmount: amount("SWAP_ADD_AMOUNT", "1000000"), // 1 USDC swapped into BTC collateral
      removeUsd: amount("SWAP_REMOVE_USD", "500000"), // $0.50 out, paid in USDC
    },
  });

  // SHORT side (collateral = USDC) — the opposite side, plain open/close.
  await runTradeLifecycle(ctx, session, {
    label: `${swapTarget} short`,
    targetSymbol: swapTarget,
    wantSide: "short",
    amountIn: tradeCollateral,
  });

  // ── SECTION 6 — withdraw deposited collateral ──────────────────────────
  // Pull funds back out of the deposit ledger to the wallet. The withdrawal
  // escrow is a delegated PDA, so the fee payer must differ from the owner — we
  // reuse the session key as that distinct payer.
  banner("6 · WITHDRAW", "move funds from the deposit ledger back to the wallet");
  explain("escrow is delegated → fee payer must ≠ owner; we reuse the session key.");
  await step("requestWithdrawal", async () => {
    const mint = custodyBySymbol(ctx.poolConfig, collateralSymbol).mintKey;
    const ownerAta = getAssociatedTokenAddressSync(mint, owner);
    // Distinct fee payer (the delegation program rejects owner==fee_payer). We
    // reuse the session key, but it has no SOL — so fund it from the owner in the
    // same tx to cover the escrow rent (refunded to the owner when it settles).
    const payer = session;
    const res = await ctx.client.withdrawalWithAction(
      mint,
      ownerAta,
      withdrawAmount,
      payer.publicKey,
    );
    const fundPayer = SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: payer.publicKey,
      lamports: Math.floor(0.02 * 1e9),
    });
    const sent = await sendBase(ctx, {
      ...res,
      instructions: [fundPayer, ...res.instructions],
      additionalSigners: [payer],
    });
    logSent(sent);
    if (!("signature" in sent)) return SKIP("dry-run");
    const [escrow] = findWithdrawalEscrowReceiptAddress(owner, mint, ctx.client.programId);
    await ctx.client.awaitClosed(escrow);
    return { settled: true };
  }, { optional: true });

  // ── summary ────────────────────────────────────────────────────────────
  printSummary();
}

function printSummary() {
  console.log(`\n${"═".repeat(72)}\n▌ SUMMARY\n${"═".repeat(72)}`);
  const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
  const mark = { PASS: "✓", FAIL: "✗", SKIP: "⊘" } as const;
  let section = "";
  for (const r of results) {
    if (r.section !== section) {
      section = r.section;
      console.log(`\n${section}`);
    }
    console.log(
      `  ${mark[r.status]} ${pad(r.name, 38)} ${pad(r.status, 5)} ${r.status === "PASS" ? r.ms + "ms" : r.detail ?? ""}`,
    );
  }
  const c = (s: Status) => results.filter((r) => r.status === s).length;
  console.log(
    `\n${"─".repeat(72)}\nPASS=${c("PASS")}  FAIL=${c("FAIL")}  SKIP=${c("SKIP")}  (mode=${SEND ? "SEND" : "DRY-RUN"})`,
  );
  if (c("FAIL") > 0) process.exitCode = 1;
}

run().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error("\nFATAL:", e?.message ?? e);
    printSummary();
    process.exit(1);
  },
);
