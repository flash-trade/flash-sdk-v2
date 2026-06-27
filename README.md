# @flash_trade/flash-sdk-v2

The TypeScript client for [Flash](https://flash.trade) — perpetuals **trading**,
**liquidity provision**, and **FAF staking** on Solana.

> Full guides: **[docs.flash.trade](https://docs.flash.trade/flash-trade/flash-trade-protocol/build-on-flash/flash-sdk-v2)**.
> Runnable, copy-pasteable scripts: [`examples/`](./examples) — start with [`examples/README.md`](./examples/README.md).

## Install

```bash
npm install @flash_trade/flash-sdk-v2
# peer deps
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

## Setup

Everything hangs off a single `FlashPerpetualsClient`. It takes two endpoints:
your own Solana RPC, and **Flash's trading endpoint** (provided by Flash) where
trades execute.

```ts
import { AnchorProvider, Wallet } from '@coral-xyz/anchor'
import { Connection, Keypair } from '@solana/web3.js'
import { FlashPerpetualsClient, PoolConfig, PROGRAM_ID, type Cluster } from '@flash_trade/flash-sdk-v2'

const CLUSTER: Cluster = 'mainnet-beta' // or 'devnet'

const connection = new Connection(process.env.RPC_URL!, 'confirmed')
const provider = new AnchorProvider(connection, new Wallet(walletKeypair), {
  commitment: 'confirmed',
})

export const poolConfig = PoolConfig.fromIdsByName('Crypto.1', CLUSTER) // devnet: 'devnet.1'

export const flashClient = new FlashPerpetualsClient(
  provider,
  undefined,             // use the bundled IDL
  PROGRAM_ID[CLUSTER],
  { prioritizationFee: 5000 },
  process.env.ER_RPC!,   // Flash's trading endpoint
)
```

## Sending transactions

Two send paths, depending on the operation:

- `flashClient.sendAndConfirmTransaction(ixs, opts?)` — setup, deposits, liquidity, staking.
- `flashClient.sendAndConfirmErTransaction(ixs, signers)` — trading (positions and orders).

## What you can do

| Area | Methods | Guide |
| --- | --- | --- |
| **Trade** | open / close / modify positions, limit & trigger orders, quotes | [Trader Interactions](https://docs.flash.trade/flash-trade/flash-trade-protocol/build-on-flash/flash-sdk-v2/trader-interactions) |
| **Provide liquidity** | FLP (auto-compounding) & sFLP (staked) mint/burn, rewards | [LP Interactions](https://docs.flash.trade/flash-trade/flash-trade-protocol/build-on-flash/flash-sdk-v2/lp-interactions) |
| **Stake FAF** | stake, unstake, claim rewards / revenue / rebates | [Revenue Interactions](https://docs.flash.trade/flash-trade/flash-trade-protocol/build-on-flash/flash-sdk-v2/revenue-interactions) |

## Examples

The [`examples/`](./examples) folder has one runnable script per method — every
mutating script is **dry-run by default** (`SEND=1` to submit). See
[`examples/README.md`](./examples/README.md) for the quickstart and
[`examples/TROUBLESHOOTING.md`](./examples/TROUBLESHOOTING.md) when something errors.

## License

MIT