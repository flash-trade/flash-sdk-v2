# Flash Perpetuals — Audit & Test-Hardening Plan

Goal: (1) find current vulnerabilities in the math/value-transfer paths, and
(2) leave behind a durable regression net so future updates can't silently
change a calculation. "Checks at the start and the end so all the math is
expected."

Two tracks run in parallel:

- **Track A (primary)** — turn the `client-v2/scripts` from *execute + log* into
  *execute + **assert***, against the live deployed program (devnet + ER).
- **Track B (thin)** — `proptest` fuzzing of the pure high-risk Rust math, since
  you can't fuzz on devnet (too slow/flaky). This is where vulns actually surface.

---

## The core idea: two-implementation agreement

Every SDK `view()` is the client's **prediction** of an outcome
(`getOpenPositionQuote`, `getEntryPriceAndFeeEr`, `getPnlEr`,
`getSwapAmountAndFees`, `getAddLiquidityAmountAndFee`). Every `step()` tx is the
on-chain program's **actual** result. Two independent implementations of the same
formula must agree — a divergence is either a SDK bug or a program bug, and in a
perp DEX that gap is where funds leak.

```
snapshot(before) → quote (SDK) → execute (program) → snapshot(after)
   → assert: actual delta ≈ quote           (cross-check)
   → assert: pool invariants still hold      (invariants)
```

## Three assertion classes

1. **Cross-check** — actual balance/PnL/fee delta vs the SDK quote (± tolerance).
   Catches formula drift between SDK and program.
2. **Invariants** — must hold after *every* mutation:
   - `custody.owned >= custody.locked` for every custody.
   - AUM conservation: a deposit-then-withdraw / open-then-close round-trip
     returns ≤ what went in (fees only; never mints value for the user).
   - Open-then-immediately-close at the same price returns *less* than deposited.
   - Every rounding favors the pool, never the user.
   - Leverage after open ≤ max_leverage; a liquidated position was actually
     liquidatable.
3. **Adversarial** — negative steps that MUST fail (assert the revert):
   stale/divergent oracle, over-leverage / MinLeverage, liquidating a healthy
   position, double-settle of an ER receipt, non-owner/non-session signer.

---

## Phasing (find-then-protect)

- [ ] **Phase 0 — baseline.** `cargo test --lib` + `cargo llvm-cov` coverage map;
      run `master.ts` dry-run green. Drive the work from the coverage gaps.
- [x] **Phase 1 — invariant guards (find).** `assert.ts` harness + `master_assert.ts`
      runner DONE. Read-only solvency invariant PASSES on live devnet. SEND=1
      cross-checks/adversarial scenarios written, need a funded wallet to run.
- [~] **Phase 2 — proptest the high-risk math (find).** Track B STARTED:
      `src/proptests.rs` covers `get_pnl_usd` (mutual-exclusion, no-panic,
      monotonicity, zero-at-entry) + `OraclePrice::scale_to_exponent`. 6 props pass.
      TODO next: `get_swap_amount` round-trip, `check_leverage` vs `get_leverage`,
      `update_borrow_rate` monotonicity, oracle confidence/divergence bands
      (need a light Custody/Market fixture — reuse pool.rs `get_fixture`).
- [ ] **Phase 3 — golden/reference tests (protect).** Independently computed
      expected values (Python/TS reference model) pinned in both Rust and the
      scripts, so a refactor that changes a formula fails CI.
- [ ] **Phase 4 — adversarial integration + ER trust boundary (find).**
      settle success/failure paths, double-settle, multisig hash-verification, oracle
      rejection.

## High-risk surfaces (from the program map)

`pool.rs`: `get_pnl_usd`, `get_liquidation_price`, `get_swap_fees`,
`check_leverage`, `get_assets_under_management_usd`. `custody.rs`:
`update_borrow_rate` (two-slope curve), `fold_fees_into_reward_index` (rounding),
`get_cumulative_lock_fee`. `oracle.rs`: `fetch_from_oracle` divergence/confidence
band logic, backup-signed-price 1% deviation. `multisig.rs`: `sign_multisig`
(hash-based instruction verification). ER: delegate/commit trust boundary,
settle.

## Conventions

- New asserting runner is `master_assert.ts` (parallel to `master.ts`, which stays
  untouched). Shared helpers in `assert.ts`.
- Tolerances are explicit and documented per assertion (oracle moves between the
  quote sim and the executed tx, so exact equality is wrong; bound the drift).
- Every assertion logs `EXPECT vs ACTUAL` so a failure is self-explanatory.
