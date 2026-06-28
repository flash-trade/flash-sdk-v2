import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { custodyBySymbol, type Ctx } from "./_lib";

// ===========================================================================
// Assertion harness for the audit runner (master_assert.ts).
//
// The scripts already EXECUTE flows and LOG. This adds the missing layer:
// VERIFY. Two independent implementations of every formula exist —
//   • the SDK view (a client-side PREDICTION: getOpenPositionQuote, getPnlEr…)
//   • the on-chain program (the ACTUAL result of the tx)
// They must agree. A divergence is a finding (SDK bug or program bug); in a
// perp DEX that gap is where funds leak.
//
// Three assertion classes (see AUDIT_PLAN.md):
//   1. cross-check — actual delta ≈ SDK quote, within an explicit tolerance
//   2. invariants  — pool truths that hold after EVERY mutation
//   3. adversarial — steps that MUST fail (assert the revert)
//
// Every check records EXPECT vs ACTUAL so a failure is self-explanatory, and
// pushes into `checks` for the end-of-run summary. Assertions NEVER throw by
// default (audit wants the full picture, not a fail-fast abort) — set
// ASSERT_THROW=1 to abort on the first failure.
// ===========================================================================

export interface Check {
  name: string;
  ok: boolean;
  expect: string;
  actual: string;
  detail?: string;
}

export const checks: Check[] = [];
const THROW = process.env.ASSERT_THROW === "1";

function record(c: Check): boolean {
  checks.push(c);
  const mark = c.ok ? "✓ ASSERT" : "✗ ASSERT";
  console.log(`  ${mark} ${c.name}`);
  console.log(`      expect: ${c.expect}`);
  console.log(`      actual: ${c.actual}${c.detail ? `   (${c.detail})` : ""}`);
  if (!c.ok && THROW) throw new Error(`assertion failed: ${c.name} — expected ${c.expect}, got ${c.actual}`);
  return c.ok;
}

// --- BN comparison primitives ----------------------------------------------

const abs = (x: BN): BN => (x.isNeg() ? x.neg() : x);

/** |actual - expected| <= tolBps/10000 * |expected|  (+ a small absolute floor
 *  so near-zero expectations don't demand exact equality). Oracle prices move
 *  between the quote sim and the executed tx, so exact equality is wrong — bound
 *  the drift instead and DOCUMENT why the tolerance is what it is. */
export function expectClose(
  name: string,
  actual: BN,
  expected: BN,
  tolBps: number,
  detail?: string,
): boolean {
  const diff = abs(actual.sub(expected));
  const tol = abs(expected).muln(tolBps).divn(10_000).addn(1);
  return record({
    name,
    ok: diff.lte(tol),
    expect: `${expected.toString()} ± ${tol.toString()} (${tolBps}bps)`,
    actual: `${actual.toString()} (Δ ${diff.toString()})`,
    detail,
  });
}

export function expectGte(name: string, actual: BN, floor: BN, detail?: string): boolean {
  return record({ name, ok: actual.gte(floor), expect: `>= ${floor.toString()}`, actual: actual.toString(), detail });
}

export function expectLte(name: string, actual: BN, ceil: BN, detail?: string): boolean {
  return record({ name, ok: actual.lte(ceil), expect: `<= ${ceil.toString()}`, actual: actual.toString(), detail });
}

export function expectEq(name: string, actual: BN, expected: BN, detail?: string): boolean {
  return record({ name, ok: actual.eq(expected), expect: `== ${expected.toString()}`, actual: actual.toString(), detail });
}

export function expectTrue(name: string, cond: boolean, detail?: string): boolean {
  return record({ name, ok: cond, expect: "true", actual: String(cond), detail });
}

// --- adversarial: a step that MUST revert ----------------------------------

/** Assert that `fn` throws (the program rejected it). `match` optionally checks
 *  the error message/code so we know it failed for the RIGHT reason, not an
 *  unrelated setup error. */
export async function expectFails(
  name: string,
  fn: () => Promise<unknown>,
  match?: string | RegExp,
): Promise<boolean> {
  try {
    await fn();
    return record({ name, ok: false, expect: "tx REVERTS", actual: "tx SUCCEEDED (should have failed)" });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const matched = !match || (typeof match === "string" ? msg.includes(match) : match.test(msg));
    return record({
      name,
      ok: matched,
      expect: `tx reverts${match ? ` matching ${match}` : ""}`,
      actual: matched ? "reverted as expected" : `reverted, but: ${msg.slice(0, 120)}`,
    });
  }
}

// --- state snapshots --------------------------------------------------------

/** SPL token balance for an owner's ATA (base units). 0 if the account is
 *  missing — callers diff before/after, so absent == 0 is correct. */
export async function tokenBalance(ctx: Ctx, mint: PublicKey, owner: PublicKey): Promise<BN> {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const r = await ctx.client.provider.connection.getTokenAccountBalance(ata).catch(() => null);
  return new BN(r?.value?.amount ?? "0");
}

/** Per-custody (owned, locked) snapshot keyed by symbol, read from base chain. */
export async function custodySnapshot(
  ctx: Ctx,
  poolName: string,
): Promise<Record<string, { owned: BN; locked: BN; collateral: BN }>> {
  const custodies: any[] = await ctx.client.accounts.fetchAllCustodies(poolName);
  const out: Record<string, { owned: BN; locked: BN; collateral: BN }> = {};
  for (const c of custodies) {
    const sym =
      ctx.poolConfig.custodies.find((x) => x.custodyAccount.equals(c.publicKey ?? c.address ?? c.custodyAccount))?.symbol ??
      c.mint?.toBase58?.() ??
      "unknown";
    const a = c.assets ?? c.account?.assets;
    if (a) out[sym] = { owned: new BN(a.owned), locked: new BN(a.locked), collateral: new BN(a.collateral) };
  }
  return out;
}

// --- invariant: owned >= locked for every custody --------------------------

/** The pool can never have more value locked into positions than it owns. A
 *  violation means a position was opened/sized against collateral the pool does
 *  not hold — direct insolvency. Call after every value-moving step. */
export async function assertCustodySolvency(ctx: Ctx, poolName: string, when: string): Promise<void> {
  const snap = await custodySnapshot(ctx, poolName);
  for (const [sym, a] of Object.entries(snap)) {
    expectGte(`solvency[${when}] ${sym}: owned >= locked`, a.owned, a.locked, `owned=${a.owned} locked=${a.locked}`);
  }
}

// --- summary ----------------------------------------------------------------

export function printAssertSummary(): void {
  const pass = checks.filter((c) => c.ok).length;
  const fail = checks.length - pass;
  console.log(`\n${"─".repeat(72)}\nASSERTIONS: PASS=${pass}  FAIL=${fail}  (total ${checks.length})`);
  if (fail > 0) {
    console.log("FAILED:");
    for (const c of checks.filter((x) => !x.ok)) console.log(`  ✗ ${c.name} — expected ${c.expect}, got ${c.actual}`);
    process.exitCode = 1;
  }
}

// re-export for convenience in the runner
export { custodyBySymbol };
