# Troubleshooting

On-chain failures come back as `{"InstructionError":[<ix index>,{"Custom":<code>}]}`.
Decode the code by its range:

| Code range | Source | Notes |
|---|---|---|
| `2000`–`2999` | **Anchor framework** constraints | e.g. `2006` = `ConstraintSeeds` |
| `≥ 6000` | the **perpetuals program's** own errors | offset from 6000 (so program error #23 = `6023`) |
| small (`0x1`, `0x3`, …) | **SPL Token** program | `0x1` = insufficient funds |
| `0x0` from `1111…1111` | **System** program | account already in use |

Tip: run with `SKIP_PREFLIGHT=0` to surface the failure in simulation (with logs)
before it's sent.

## Common errors

| Error | What it means | Fix |
|---|---|---|
| `Custom 2006` — Anchor `ConstraintSeeds` | An account you passed is a PDA that doesn't match what the program re-derives from its seeds + program id. | Most often the **wrong collateral symbol for the market** (the market PDA is derived from target + collateral + side). Resolve the market first and use *its* collateral symbol — don't hardcode one. Also check `CLUSTER`/`POOL`/program id all line up. |
| `Custom 6023` — `MinLeverage` | Resulting leverage is below the market minimum. | `sizeAmount` is in **target-token base units**, not USD. Don't hand-pick a raw size — derive it from a quote at your target leverage (`getOpenPositionQuote`, `leverage` in BPS, `20000` = 2×). |
| `Custom 6021` — `MaxLeverage` | Resulting leverage is above the market max. | Same root cause as above (size↔collateral mismatch), other direction. Lower the size or raise collateral; derive size from a quote. |
| SPL Token `0x1` — insufficient funds | The funding token account is empty or underfunded. | For **trades**, collateral must be in the deposit ledger first — run the one-time `setup`. For **staking**, you need FAF in your wallet (no public faucet — get it from the Flash team). |
| System `0x0` — account already in use | A receipt from a prior, half-finished liquidity/stake flow is still open, so the new `*WithAction` can't recreate it. | **Resume** the existing receipt instead of resubmitting — see below. |
| `Custom 3001` — `AccountDiscriminatorNotFound` (`0xbb9`) | You drove a follow-up step on a receipt that was **already finished** (Flash, or a prior run, already completed it). | Don't drive the follow-up yourself on the happy path. Use the script's `RESUME=1` only when a receipt is genuinely stuck. |
| `Custom 6076` — `ReceiptAlreadyProcessed` | Re-ran a follow-up step on an already-finished receipt. | Let the script finish it instead. The scripts' resume (`AMOUNT=0`) is state-aware and does this for you. |
| `Custom 3012` — account not found, on `getPnl`/`getPositionData`/`getLiquidation*` | The base position views target a different position model than Flash uses. | Use the `*Er` variants (`getPnlEr`, `getPositionDataEr`, `getLiquidationPriceEr`, `get*QuoteEr`) — positions live in your **basket**. |
| `No pool with <name> found!` | The pool name isn't in the SDK's bundled config for that cluster. | Check `CLUSTER` + `POOL` match (e.g. `devnet` + `devnet.1`) and that your SDK version ships that pool. |
| Views fail to simulate / time out | `ER_ENDPOINT` isn't pointed at Flash's trading endpoint. | Point `ER_ENDPOINT` at Flash's trading endpoint (devnet: `https://devnet-as.magicblock.app`). |

## Stuck or pending liquidity / stake receipts

These flows are multi-step and complete through a receipt account. If a run is
interrupted, the receipt is left open — finish it rather than starting over:

- **Resume a flow:** re-run the same script with the amount set to `0`
  (`AMOUNT_IN=0` / `COMPOUNDING_AMOUNT_IN=0` / `UNSTAKE_AMOUNT=0` /
  `MIGRATE_AMOUNT=0`). It picks up wherever the flow stopped and finishes the
  open receipt.
- **Find what's pending:** `processPendingLiquidity` (and the per-kind
  `processPending*` scripts) scan your wallet's receipts and report each open
  one. Dry-run lists them; `SEND=1` finishes them. `OWNER=<pubkey>` scans another
  wallet; `SYMBOL=USDC` narrows to one token.
- **Close one receipt directly:** `lp/closeReceipt.ts` with `FLOW=<...>`
  finalizes a single open receipt without re-running its whole script.

## Gotchas

- **A confirmed transaction is not a successful action.** Liquidity/stake flows
  can refund on a slippage/cap miss and the tx still succeeds — trust the receipt
  outcome, not the signature.
- **Dust on remove.** Unstaking/withdrawing an amount so small it rounds to 0
  tokens-out trips a `> 0` constraint and leaves the receipt open. Use a non-dust
  amount.
- **Fresh sFLP can't be unstaked immediately** — it's `pending_activation` until
  it activates (the mint-sFLP script activates it for you).
- **FAF token flows finish on their own.** The FAF token operations complete
  their follow-up steps automatically — just send the transaction and let the
  script poll. Don't drive the follow-up yourself (it double-executes → `3001`).
  Use `RESUME=1` only to recover a genuinely stuck receipt.
