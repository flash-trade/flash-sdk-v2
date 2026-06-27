# Flash SDK v2 — Examples

Runnable TypeScript examples for the [`@flash_trade/flash-sdk-v2`](https://www.npmjs.com/package/@flash_trade/flash-sdk-v2)
client: **trading, liquidity provision, and FAF staking** on Flash (Solana
perps). One file per SDK method — run it, read the output, tweak, repeat.

Each example imports the SDK **by its package name** (`@flash_trade/flash-sdk-v2`),
so you can copy any file straight into your own project and it'll resolve to the
installed npm package. (Inside this repo it resolves to local source — see
[How `yarn example` resolves the SDK](#how-yarn-example-resolves-the-sdk).)

> New to the model? Skim **[Core concepts](#core-concepts)** first.

## Quickstart

**Prerequisites:** Node 18+, Yarn, and a Solana **devnet** wallet at
`~/.config/solana/id.json` (or point `WALLET` at one) with a little devnet SOL.

```bash
yarn install
cp .env.example .env          # devnet defaults are ready to go

# 1) First call — read-only, needs only an RPC. Nothing can move funds.
yarn example examples/reads/fetchPool.ts
yarn example examples/views/getLpTokenPrice.ts
```

### Safety model: everything is a dry run by default

Any example that *writes* to the chain only **builds and reports** unless you add
`SEND=1`. So you can run anything to see exactly what it would do, then opt in:

```bash
yarn example examples/setup/depositDirect.ts          # DRY-RUN: builds, no write
SEND=1 yarn example examples/setup/depositDirect.ts   # actually submits
```

### Your first trade (devnet)

Trading is **basket-backed**: run the one-time setup once per wallet, then quote
and trade. Position size is derived from a **leverage** quote, so you won't trip
`MinLeverage` by guessing a raw size.

```bash
# one-time per wallet (needs devnet SOL + the collateral token in your wallet)
SEND=1 yarn example examples/setup/initializeUserDepositLedger.ts
SEND=1 yarn example examples/setup/initializeBasket.ts
SEND=1 yarn example examples/setup/initTradeVault.ts
SEND=1 yarn example examples/setup/depositDirect.ts          # deposit collateral
SEND=1 yarn example examples/setup/delegateBasket.ts

# quote, then trade (SESSION_KEY signs trades — see Core concepts)
yarn example examples/views/getOpenPositionQuote.ts
SEND=1 SESSION_KEY=~/session.json yarn example examples/trade/openPosition.ts
SEND=1 SESSION_KEY=~/session.json yarn example examples/trade/closePosition.ts
```

Or run the whole thing end-to-end with [`master.ts`](#end-to-end-runners).

### Getting devnet test tokens

- **SOL** (for fees): `solana airdrop 2 <your-pubkey> --url devnet`.
- **Collateral tokens & FAF**: there's no public faucet mint — get devnet USDC /
  FAF from the Flash team or the devnet UI. Staking examples need FAF in your
  wallet first.

### How `yarn example` resolves the SDK

`yarn example <file>` runs `tsx --tsconfig examples/tsconfig.json <file>`. That
tsconfig maps `@flash_trade/flash-sdk-v2` → the local `../src` while you're in
this repo (no build step, always current). Copy an example into your own project
and the same import falls back to your installed npm package. One source, both
worlds.

## Core concepts

- **Two endpoints.** A normal Solana **RPC** (`RPC_URL`) for setup, deposits,
  liquidity, and staking; and **Flash's trading endpoint** (`ER_ENDPOINT`,
  provided by Flash) where trades and order execution run. Quotes read from
  Flash's trading endpoint too.
- **The basket.** Your positions and orders live inside a per-wallet **basket**,
  funded from a **deposit ledger** — not in standalone per-position accounts.
- **FLP vs sFLP.** Two LP tokens: **FLP** auto-compounds (no claim step); **sFLP**
  is staked and earns a yield you claim separately. sFLP isn't held in your
  wallet — it lives in a stake account.
- **Receipts (liquidity & staking).** These flows are multi-step and complete
  asynchronously through a **receipt**. **A confirmed transaction is not a
  successful action** — on a slippage/cap miss you're refunded and the tx still
  succeeds; trust the receipt outcome, not the signature. The scripts poll it
  for you.

Hit an error? See **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)**.

---

# Reference

Each script has an inline `// ── CONFIG ──` block you can edit, and most knobs
are also env-overridable (see [Env](#env)). Output is pretty-printed with
BN→string and PublicKey→base58.

## End-to-end runners

Two scripts chain a full lifecycle in serial with a PASS/FAIL/SKIP summary:

```bash
# trading + liquidity: reads/views → setup → LP → trade → withdraw
yarn example examples/master.ts            # DRY-RUN: reads/views + builds, no writes
SEND=1 yarn example examples/master.ts     # full e2e (auto-generates a session)

# FAF staking: reads → stake → claims → unstake → withdraw
yarn example examples/token/masterToken.ts
SEND=1 yarn example examples/token/masterToken.ts
```

`master.ts` open size is derived from a quote at ~2× (a 1:1 size trips
`MinLeverage`); it auto-closes a leftover position first so the run is
repeatable. Knobs: `DEPOSIT_AMOUNT`, `LP_AMOUNT`, `STAKE_AMOUNT`,
`TRADE_COLLATERAL`, `WITHDRAW_AMOUNT`, `STOP_ON_FAIL`, and more (see the file
header).

## Layout

| Dir | What | Writes? |
|---|---|---|
| `reads/` | `fetchPerpetuals`, `fetchPool`, `fetchAllCustodies`, `fetchBasket` | no |
| `views/` | the quote / price / PnL / liquidation views | no (simulate) |
| `setup/` | `initializeBasket`, `initializeUserDepositLedger`, `depositDirect`, `delegateBasket`, `createSession` | `SEND=1` |
| `trade/` | `openPosition`, `closePosition`, `increase/decreasePositionSize`, `add/removeCollateral` | `SEND=1` |
| `lp/` | `addLiquidityAndStake`, `removeLiquidity` (sFLP), `add/removeCompoundingLiquidity` (FLP), `migrateFLPwithAction`, `migrateStakeWithAction`, `processPending*`, `closeReceipt` | `SEND=1` |
| `token/` | FAF staking: `depositTokenStake`, `unstakeTokenRequest`, `cancelUnstakeTokenRequest`, `withdrawTokenWithAction`, `collectFAF`/`collectRevenue`/`collectRewards`, `masterToken` | `SEND=1` |

## Liquidity (FLP & sFLP)

Mint, burn, and migrate are **multi-step flows that complete asynchronously** —
each script drives every step for you and prints a before/after balance table
(the touched accounts, raw base units) so you can see exactly what moved.

- **Resume an interrupted flow:** re-run the same script with the amount set to
  `0` (`AMOUNT_IN=0` / `COMPOUNDING_AMOUNT_IN=0` / `UNSTAKE_AMOUNT=0` /
  `MIGRATE_AMOUNT=0`) — it skips ahead and just finishes the open receipt.
- **Find unfinished flows:** `processPendingLiquidity` scans your wallet's
  receipts and reports each one; dry-run lists them, `SEND=1` finishes them.
  `OWNER=<pubkey>` to scan another wallet; `SYMBOL=USDC` to narrow to one token.
- **Close one receipt:** `lp/closeReceipt.ts` with `FLOW=<...>` finalizes a
  single open receipt without re-running its whole script.
- Freshly-minted **sFLP can't be unstaked until it activates** (the mint script
  activates it for you).
- **Dust caveat:** removing an amount so small it rounds to 0 tokens-out leaves
  the receipt open — use a non-dust amount.

`FLOW ∈ {remove-liquidity, add-stake, add-compounding, remove-compounding,
migrate-flp, migrate-stake}`. Override knobs: `IN_SYMBOL`/`OUT_SYMBOL`,
`AMOUNT_IN`/`UNSTAKE_AMOUNT`/`COMPOUNDING_AMOUNT_IN`,
`MIN_LP_AMOUNT_OUT`/`MIN_AMOUNT_OUT`/`MIN_COMPOUNDING_AMOUNT_OUT`, `REWARD_SYMBOL`.

## FAF staking (`token/`)

The governance-staking lifecycle:

1. `depositTokenStake` — **stake**. Stays active after, so unstake/cancel/withdraw run against it.
2. `unstakeTokenRequest` — **begin unlock**; matures after the vault's unlock period.
3. `cancelUnstakeTokenRequest` — **cancel** a pending request by id; returns it to the active stake.
4. `withdrawTokenWithAction` — **withdraw** a matured request.
5. **Claims**, one per stream — `collectFAF` (staking reward), `collectRevenue`
   (protocol-revenue share), `collectRewards` (trading rebate). An unowed stream
   settles 0 and closes — safe to call speculatively.

`masterToken.ts` runs the whole lifecycle. Knobs: `STAKE_AMOUNT`,
`UNSTAKE_AMOUNT`, `WITHDRAW_REQUEST_ID`, `TOKEN22=1` (if FAF is a Token-2022
mint). A freshly-created unstake won't mature within a single run. Recover a
stuck flow with `RESUME=1`.

## Position views

Position-level views (`getPnl`, `getPositionData`, `getExitPriceAndFee`,
`getLiquidationPrice`/`State`, `getClose`/`Add`/`RemoveCollateralQuote`) need the
wallet to hold an open position in the chosen market.

> **Use the `*Er` variants.** `getPnlEr`, `getPositionDataEr`,
> `getLiquidation{Price,State}Er`, `get{Close,Add,Remove}*QuoteEr` read your
> **basket**. The plain (non-`Er`) variants target a different position model and
> won't find basket positions (account-not-found).

### `getClosePositionQuoteEr.ts` — close quote (full or partial)

Reads your basket to find the position, then quotes a full or partial close:

```bash
# FULL close (sizeDeltaUsd = the position's full sizeUsd)
CLUSTER=devnet POOL=devnet.4 TARGET_SYMBOL=PENGU SIDE=short OWNER=<owner-pubkey> \
yarn example examples/views/getClosePositionQuoteEr.ts

# PARTIAL by USD notional (6dp) — e.g. close $12.35
… SIZE_DELTA_USD=12350000 yarn example examples/views/getClosePositionQuoteEr.ts

# PARTIAL by target-token amount (base units) — converted to USD proportionally
… SIZE_AMOUNT=855063200 yarn example examples/views/getClosePositionQuoteEr.ts
```

Knobs: `OWNER` (defaults to the loaded wallet), `TARGET_SYMBOL`, `SIDE`
(`long|short`), one of `SIZE_DELTA_USD` / `SIZE_AMOUNT` (omit both → full close),
`DISPENSING_SYMBOL` (default: market collateral), `PRIVILEGE`
(`none|stake|referral`), `DISCOUNT_INDEX`.

## Env

Set via shell or a `.env` file.

| Var | Default | Notes |
|---|---|---|
| `SEND` | unset (dry-run) | `1` to actually submit mutating ops |
| `SKIP_PREFLIGHT` | `1` (skip) | `0` to simulate before send (surfaces the error pre-flight). Base-layer only. |
| `CLUSTER` | `devnet` | |
| `RPC_URL` | devnet public RPC | your Solana RPC |
| `ER_ENDPOINT` | `https://devnet-as.magicblock.app` | Flash's trading endpoint (trades & quotes) |
| `WALLET` / `KEYPAIR_PATH` | `~/.config/solana/id.json` | owner keypair |
| `SESSION_KEY` | — | session keypair file (required to submit trades) |
| `POOL` | `devnet.1` | |
| `TARGET_SYMBOL` / `COLLATERAL_SYMBOL` | `SOL` / `USDC` | |
| `SIDE` | `short` | `long`/`short` market picker |
| `OWNER` | loaded wallet | inspect/quote another wallet (read-only views) |
| `SYMBOL` | `COLLATERAL_SYMBOL` | token override for `depositDirect` / `initTradeVault` / `processPending*` |
| amount knobs (`AMOUNT_IN`, `COLLATERAL_AMOUNT`, `LEVERAGE_BPS`, `SLIPPAGE_BPS`, `DEPOSIT_AMOUNT`, `STAKE_AMOUNT`, …) | per-script tiny defaults | base-unit overrides |

> These runners are for manual, one-method-at-a-time inspection — run a single
> method, read its output, tweak the CONFIG/env, repeat.
