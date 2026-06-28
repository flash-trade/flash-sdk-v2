# client-v2 method runners

`app/`-style standalone scripts — **one file per client method**, run individually
with `ts-node`, print the formatted result, no test framework. Use these to
exercise / inspect a single method against a live cluster.

```bash
cd client-v2
yarn install

# read-only views & fetches — just needs RPC
npx ts-node scripts/views/getLpTokenPrice.ts
npx ts-node scripts/views/getOpenPositionQuote.ts
npx ts-node scripts/reads/fetchPool.ts

# mutating ops are DRY-RUN by default (build + report, no chain write)
npx ts-node scripts/setup/initializeBasket.ts
# add SEND=1 to actually submit
SEND=1 npx ts-node scripts/setup/depositDirect.ts
SEND=1 SESSION_KEY=~/session.json npx ts-node scripts/trade/openPosition.ts
```

Each script has an inline `// ── CONFIG ──` block you can edit, and most knobs
are also env-overridable (see below). Output is pretty-printed with BN→string
and PublicKey→base58 (the same `format()` helper `app/` uses).

## Master end-to-end runner

`master.ts` chains every action in serial — reads/views → account setup →
compounding LP → staked LP → trade lifecycle → swaps & both sides → withdraw —
calling the relevant view/quote functions at each stage. It's a self-contained, re-runnable test case
with a PASS/FAIL/SKIP summary (one shared process → one session keypair).

```bash
npx ts-node scripts/master.ts            # DRY-RUN: reads/views + builds, no writes
SEND=1 npx ts-node scripts/master.ts     # full e2e (auto-generates + registers a session)
SEND=1 SESSION_KEY=~/session.json npx ts-node scripts/master.ts   # reuse a session
```

Notes baked into the flow (each with an inline `┄` explanation in the output):
setup is idempotent (skips accounts that already exist); ER positions live in the
**basket**, so the trade section reads the basket (the standalone `getPositionData`/
`getPnl`/`getLiquidation*`/`get*Quote` views target a non-ER position model and
don't apply here); open size is derived from the quote at ~2× (a 1:1 size trips
`MinLeverage`); decrease/close wait out the `curtime > update_time` guard
(`POSITION_SETTLE_MS`, default 2000); a leftover position is auto-closed first so
the run is repeatable.

Section **5b** demonstrates the OTHER side and SWAPS: it opens/closes both a long
and a short, and runs cross-custody collateral ops — a BTC-collateral long whose
`add/removeCollateral` are funded/paid in USDC, so the program swaps USDC↔BTC
under the hood (`runTradeLifecycle(..., { swap })`). Knobs: `DEPOSIT_AMOUNT`,
`LP_AMOUNT`, `STAKE_AMOUNT`, `TRADE_COLLATERAL`, `WITHDRAW_AMOUNT`, `SWAP_TARGET`
(default BTC), `SWAP_DEPOSIT`, `SWAP_LONG_AMOUNT_IN`, `SWAP_ADD_AMOUNT`,
`SWAP_REMOVE_USD`, `POSITION_SETTLE_MS`, `STOP_ON_FAIL`.

## Layout

| Dir | What | Chain write? |
|---|---|---|
| `reads/` | `fetchPerpetuals`, `fetchPool`, `fetchAllCustodies`, `fetchBasket` | no |
| `views/` | all 18 view/quote functions | no (simulate) |
| `setup/` | `initializeBasket`, `initializeUserDepositLedger`, `depositDirect`, `delegateBasket`, `createSession` | DRY-RUN unless `SEND=1` |
| `trade/` | `openPosition`, `closePosition`, `increase/decreasePositionSize`, `add/removeCollateral` | DRY-RUN unless `SEND=1` |
| `lp/` | `addLiquidityAndStake`, `removeLiquidity` (staked FLP), `add/removeCompoundingLiquidity` (sFLP), `migrateFLPwithAction` (sFLP → staked FLP), `migrateStakeWithAction` (staked FLP → sFLP), `processPending{Deposits,Withdraws,Liquidity,StakeDeposit,StakedWithdraw}` | DRY-RUN unless `SEND=1` |
| `token/` | FAF token-stake lifecycle: `depositTokenStake` (stake), `unstakeTokenRequest`, `cancelUnstakeTokenRequest`, `withdrawTokenWithAction`, collects (`collectFAF`/`collectRevenue`/`collectRewards`), and `masterToken` (full e2e) | DRY-RUN unless `SEND=1` |

**Compounding add/remove AND staked-LP add/remove** all drive the full ER flow
client-side (mirrors flash-magic-ui `useLiquidityER`) — they do NOT depend on a
keeper:

1. base tx (`queueErAction:false`): create the ATA + stage tokens + delegate the receipt
2. poll the receipt onto the ER
3. ER `_er` commit, signed by a throwaway ephemeral payer
4. poll the base chain until the receipt settles + closes

Each phase logs its own `signature` + explorer (base → Solana explorer, ER →
MagicBlock explorer). They delegate to the per-cluster validator
(`validatorKey()` → devnet `MAS1Dt9…`, overridable via `VALIDATOR_KEY`) with a 10s
commit frequency — these MUST match the validator the `ER_ENDPOINT` serves, else
the delegated receipt never appears on the ER. The staked-LP base tx is large
(forwards the full AUM account set), so `sendBase` attaches the pool's address
lookup tables (`PoolConfig.addressLookupTableAddresses`) to fit the 1232-byte
legacy limit.

> **Resume / unstick:** if a prior run left a receipt delegated+pending, re-run
> with the amount set to `0` (`AMOUNT_IN=0` / `COMPOUNDING_AMOUNT_IN=0` /
> `UNSTAKE_AMOUNT=0`) to skip phase 1 and just drive `_er` → settle, closing it.
> (A receipt orphaned by the old keeper-driven path may be un-cloneable by the ER
> — `InvalidWritableAccount` — and need manual recovery.)

> **Dust caveat (remove):** unstaking/withdrawing an amount so small it rounds to
> 0 tokens out queues the *settle* action, whose `token_amount_to_withdraw > 0`
> constraint then fails, leaving the receipt undelegated-but-open. Use a
> non-dust amount.

**Process pending** (`processPendingDeposits` / `processPendingWithdraws` /
`processPendingStakeDeposit` / `processPendingStakedWithdraw` /
`processPendingLiquidity`) settle LP receipts ALREADY staged+pending — the
compounding (sFLP) `Deposits`/`Withdraws` and the staked-LP (FLP)
`StakeDeposit` (`add_liquidity_and_stake`) / `StakedWithdraw` (`remove_liquidity`)
kinds — by driving the `_er` commit → settle. They never create a
deposit/withdraw. They are
**wallet-scoped** like the UI: for the loaded keypair (override with
`OWNER=<pubkey>`) they derive the receipt PDA per token and report its
`location` — `base-chain` (delegated but not yet on the ER) or `ephemeral-rollup`
(active on the ER). A PDA-derive + direct lookup is used (not `*.all()`) because
a delegated base stub is owned by the delegation program, so an ER-only scan
misses it. Set `SYMBOL=USDC` to narrow to one token; omit it to scan all
custodies. Dry-run (no `SEND=1`) lists what's pending + where; `SEND=1` settles.
`processPendingLiquidity` does all four kinds in one pass.

**Staked-LP add/remove** (`addLiquidityAndStake` / `removeLiquidity`) now use the
same client-driven 4-phase flow as compounding, via the
`addLiquidityAndStakeEr` / `removeLiquidityEr` builders added to client-v2. Note
freshly-staked LP is `pending_activation` and can't be unstaked until it
activates.

**Migrate sFLP → staked FLP** (`migrateFLPwithAction`) drives the `migrate_flp`
flow: the base tx burns the user's sFLP upfront, lazily inits + delegates
`flp_stake`, and delegates the (pool-scoped) migrate receipt; the `_er` commit
redeems the burnt sFLP for LP and stakes it, gated by a lp_price slippage check.
On a slippage fail the post-undelegate `migrate_flp_settle` failure branch
re-mints the upfront-burnt sFLP back to the user. Resume a stuck receipt with
`COMPOUNDING_AMOUNT=0`.

**Migrate staked FLP → sFLP** (`migrateStakeWithAction`) is the reverse: it
unstakes `MIGRATE_AMOUNT` of the user's staked FLP and credits sFLP via the
`migrate_stake` flow (`migrate_stake_er` → `migrate_stake_settle`).
Resume a stuck receipt with `MIGRATE_AMOUNT=0`.

**State-aware finalize + balances (all LP/migrate scripts).** Every script wraps
its run in a before/after **balance table** (the touched ATAs, raw base units) so
you can see exactly what moved. Phase 4 is a shared `finalizeReceipt` (see
`scripts/lp/_finalize.ts`): after the `_er` commit it waits for the ER-queued
settle to auto-close the receipt, and if that didn't run it reads the receipt's
decision field (e.g. `lp_amount_out`, `token_amount_to_withdraw`) for logging
and drives **settle** directly on the base chain. Resume (`AMOUNT=0`) is likewise
state-aware: it routes a delegated receipt to `_er` and a processed receipt
straight to settle — re-running `_er` on a processed receipt fails
`ReceiptAlreadyProcessed` (6076). The batch
`processPending*` runners share the same logic.

**Standalone close (`closeReceipt`).** Directly drives the unified `*_settle`
instruction to close a single processed-but-open receipt for any flow without
re-running its full script. Pick the flow + token and it reads the decision
field before driving settle:

```
FLOW=remove-liquidity SYMBOL=BTC ts-node scripts/lp/closeReceipt.ts          # dry-run
SEND=1 FLOW=remove-liquidity SYMBOL=BTC ts-node scripts/lp/closeReceipt.ts   # close it
SEND=1 FLOW=migrate-flp ts-node scripts/lp/closeReceipt.ts
```

`FLOW ∈ {remove-liquidity, add-stake, add-compounding, remove-compounding,
migrate-flp, migrate-stake}`; `OWNER=<pubkey>` to close someone else's receipt
(this wallet pays the fee). It only closes *processed* receipts — for a
not-yet-`_er`'d one, use the flow's own script resume.

Override knobs via env: `IN_SYMBOL`/`OUT_SYMBOL`,
`AMOUNT_IN`/`UNSTAKE_AMOUNT`/`COMPOUNDING_AMOUNT_IN`,
`MIN_LP_AMOUNT_OUT`/`MIN_AMOUNT_OUT`/`MIN_COMPOUNDING_AMOUNT_OUT`, `REWARD_SYMBOL`,
`COMMIT_FREQUENCY`, `VALIDATOR_KEY`.

**FAF token-stake** (`token/`) covers the governance-staking lifecycle, all over
the ER:

1. `depositTokenStake` (**stake**) — base `deposit_token_stake_with_action` then
   poll for settle. The token_stake stays delegated after settle, so unstake/
   cancel/withdraw run against it.
2. `unstakeTokenRequest` (**unstake**) — direct-ER `unstake_token_request_er`;
   appends a `withdraw_request` that matures after the vault `unlock_period`.
3. `cancelUnstakeTokenRequest` (**cancel**) — direct-ER cancel by request id;
   returns the locked tokens to the active stake.
4. `withdrawTokenWithAction` (**withdraw**) — base `withdraw_token_with_action`
   then poll for settle, to settle a matured request. `amount==0` is the no-op
   "revert" path (nothing matured / stale id / withdrawals disabled) that just
   closes the receipt.
5. **collects** — same base-tx-then-poll auto-`_er` flow, one per claimable
   stream: `collectFAF` (`collect_token_reward` → FAF staking reward),
   `collectRevenue` (`collect_revenue` → protocol-revenue share), `collectRewards`
   (`collect_rebate` → trading rebate). The revenue/rebate payout mints are read
   on-chain from the pool's `revenueTokenAccount` / `rebateTokenAccount`; an unowed
   stream settles 0 and just closes the receipt.

`masterToken.ts` chains the whole lifecycle in serial (reads → stake → all three
collects → unstake → withdraw) with a PASS/FAIL/SKIP summary — the token-side
analogue of `master.ts`:

```bash
npx ts-node scripts/token/masterToken.ts          # DRY-RUN: reads + builds, no writes
SEND=1 npx ts-node scripts/token/masterToken.ts   # full e2e on devnet
```

It skips `depositTokenStake` when the token_stake is already delegated (you can
only delegate it once), and skips `unstake`/`withdraw` via `SKIP_UNSTAKE=1` /
`SKIP_WITHDRAW=1`. A freshly-created unstake does not mature within the run, so
the withdraw usually settles 0 unless a prior matured request exists — still a
full delegate → `_er` → settle exercise.

> **Auto-driven `_er` (important):** unlike the LP flow, the token `_with_action`
> instructions (deposit / withdraw / collect-reward) ALWAYS queue their `_er` step
> as a post-delegation action that the validator runs automatically — there is no
> `queueErAction` opt-out. So `depositTokenStake` / `withdrawTokenWithAction` only
> send the base tx and then poll the base chain until the receipt settles + closes
> (`_er` → settle happen on their own). Do NOT drive `_er` from the client on the
> happy path — doing so double-executes it and fails with
> `AccountDiscriminatorNotFound` (0xbb9 / 3001) because the auto-action already
> processed + closed the receipt. The manual `_er` path is exposed as `RESUME=1`
> recovery only, for when the auto-action did not run and the receipt is stuck
> delegated+pending on the ER.

Knobs: `STAKE_AMOUNT`, `UNSTAKE_AMOUNT`, `WITHDRAW_REQUEST_ID` (else the first
matured / cancellable request is auto-picked), `TOKEN22=1` (if the FAF mint is
Token-2022), plus the shared `COMMIT_FREQUENCY` / `VALIDATOR_KEY`. The FAF mint,
vault and vault token account are read off `PoolConfig` (`tokenMint` etc.).
`depositTokenStake` / `withdrawTokenWithAction` also take `RESUME=1` to recover a
stuck receipt by driving `_er` → settle without re-issuing the base tx.

Position-level views (`getPnl`, `getPositionData`, `getExitPriceAndFee`,
`getLiquidationPrice/State`, `getClose/Add/RemoveCollateralQuote`) need the wallet
to hold an open position in the chosen market.

## Env (via shell or a `.env` file)

| Var | Default | Notes |
|---|---|---|
| `SEND` | unset (dry-run) | `1` to actually submit mutating ops |
| `SKIP_PREFLIGHT` | `1` (skip) | `0` to run an on-chain simulation before send (surfaces the error pre-flight). Base-layer only; ER sends always skip preflight. |
| `CLUSTER` | `devnet` | |
| `RPC_URL` | devnet public RPC | base-layer RPC |
| `ER_ENDPOINT` | `https://devnet-as.magicblock.app` | MagicBlock validator RPC (views/ER trades). The router can't simulate. |
| `WALLET` / `KEYPAIR_PATH` | `~/.config/solana/id.json` | owner keypair |
| `SESSION_KEY` | — | session keypair file (required to submit ER trades). For `requestWithdrawal` it's an OPTIONAL distinct fee payer — omit it and the script auto-generates + funds + reclaims a throwaway payer. |
| `SYMBOL` | `COLLATERAL_SYMBOL` | token override for `depositDirect` / `requestWithdrawal` / `initTradeVault` |
| `POOL` | `Pool.0` | |
| `TARGET_SYMBOL` / `COLLATERAL_SYMBOL` | `SOL` / `USDC` | |
| `AMOUNT_IN`, `SIZE_AMOUNT`, `COLLATERAL_AMOUNT`, `SIZE_DELTA`, `LEVERAGE_BPS`, `SLIPPAGE_BPS`, `DEPOSIT_AMOUNT`, `WITHDRAW_AMOUNT`, `FEE_PAYER_FUNDING_SOL`, … | per-script tiny defaults | base-unit overrides. `requestWithdrawal` also takes the amount as a positional CLI arg (`… requestWithdrawal.ts 50000`). |

> These runners are for manual, one-method-at-a-time inspection — run a single
> method, read its output, tweak the CONFIG/env, repeat.
