import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import poolConfigs from "./PoolConfig.json";

// ---------------------------------------------------------------------------
// Program IDs
// ---------------------------------------------------------------------------

/** Clusters the SDK ships addresses for. */
export type Cluster = "mainnet-beta" | "devnet";

/**
 * Fallback perpetuals program id per cluster — used only when PoolConfig.json
 * has no (non-deprecated) pool for that cluster. The canonical source of truth
 * is `pools[].programId`; these defaults exist so clusters absent from the
 * config (e.g. mainnet, which currently ships no pool entry) still resolve.
 */
const FALLBACK_PROGRAM_ID: Record<Cluster, string> = {
  "mainnet-beta": "FLASH6Lo6h3iasJKWDs2F8TkW2UKf3s15C8PMGuVfgBn",
  devnet: "FTPP4jEWW1n8s2FEccwVfS9KCPjpndaswg7Nkkuz4ER4",
};

/** Resolve a cluster's perpetuals program id from PoolConfig.json, preferring a
 *  live (non-deprecated) pool, then any pool, then the hardcoded fallback. */
const resolveProgramId = (cluster: Cluster): PublicKey => {
  const pools = poolConfigs.pools.filter((p) => p.cluster === cluster);
  const pool = pools.find((p) => !p.isDeprecated) ?? pools[0];
  return new PublicKey(pool?.programId ?? FALLBACK_PROGRAM_ID[cluster]);
};

/** Perpetuals program id per cluster — derived from PoolConfig.json. */
export const PROGRAM_ID: Record<Cluster, PublicKey> = {
  "mainnet-beta": resolveProgramId("mainnet-beta"),
  devnet: resolveProgramId("devnet"),
};

/** Perpetuals program (mainnet default). Use `PROGRAM_ID[cluster]` for devnet. */
export const PERPETUALS_PROGRAM_ID = PROGRAM_ID["mainnet-beta"];

export const programIdForCluster = (cluster: Cluster): PublicKey => PROGRAM_ID[cluster];

/** MagicBlock delegation program. Owns every delegated PDA on the base layer;
 *  `delegation_record` / `delegation_metadata` PDAs derive against this. */
export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
);

/** MagicBlock magic program + context (used by #[commit] / ScheduleCommit). */
export const MAGIC_PROGRAM_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111",
);
export const MAGIC_CONTEXT_ID = new PublicKey(
  "MagicContext1111111111111111111111111111111",
);

/** MagicBlock Session Keys program — owns session-token PDAs that authorize a
 *  session signer to act for an authority against a target program. */
export const SESSION_KEYS_PROGRAM_ID = new PublicKey(
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5",
);
export const SESSION_TOKEN_SEED = "session_token_v2";

/** Pyth Lazer program — owns the storage PDA the internal-oracle price pusher
 *  derives. External, cluster-independent address. */
export const PYTH_LAZER_PROGRAM_ID = new PublicKey(
  "pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt",
);

/** Default ER validator the program falls back to when `validator` is null. */
export const MAGICBLOCK_VALIDATOR_KEY: Record<Cluster, PublicKey> = {
  "mainnet-beta": new PublicKey("FLAshCJGr4SWk23bDVy7yeZecfND8h5Cingy1u2XE6HQ"),
  devnet: new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
};

export const validatorKeyForCluster = (cluster: Cluster): PublicKey =>
  MAGICBLOCK_VALIDATOR_KEY[cluster];

/**
 * Resolve the ER validator key from the program id the client is talking to.
 * Mirrors the on-chain `#[cfg(feature = "mainnet")]` gating of
 * `MAGICBLOCK_VALIDATOR_KEY`: the mainnet program build pins the fee vault to
 * the mainnet validator, every other build (devnet/localnet) to the devnet
 * validator. ER instruction builders default to this so they can't silently
 * derive a devnet-scoped `magic_fee_vault` against a mainnet deployment (which
 * the on-chain `address =` constraint would reject).
 */
export const validatorKeyForProgramId = (programId: PublicKey): PublicKey =>
  programId.equals(PROGRAM_ID["mainnet-beta"])
    ? MAGICBLOCK_VALIDATOR_KEY["mainnet-beta"]
    : MAGICBLOCK_VALIDATOR_KEY.devnet;

// ---------------------------------------------------------------------------
// PDA seeds (byte-exact with the on-chain program)
// ---------------------------------------------------------------------------

export const SEEDS = {
  perpetuals: "perpetuals",
  pool: "pool",
  custody: "custody",
  custodyTokenAccount: "custody_token_account",
  transferAuthority: "transfer_authority",
  multisig: "multisig",
  eventAuthority: "__event_authority",
  oracleAccount: "oracle_account",
  reallocVault: "realloc_vault",
  whitelist: "whitelist",
  // staking
  stake: "stake",
  stakedLpTokenAccount: "staked_lp_token_account",
  // receipts
  swapReceipt: "swap_receipt",
  stakingDepositReceipt: "staking_deposit_receipt",
  stakingWithdrawReceipt: "staking_withdraw_receipt",
  compDepositReceipt: "comp_deposit_receipt",
  compWithdrawReceipt: "comp_withdraw_receipt",
  collectStakeRewardReceipt: "collect_stake_reward_receipt",
  compoundFeesReceipt: "compound_fees_receipt",
  migrateStakeReceipt: "migrate_stake_receipt",
  migrateFlpReceipt: "migrate_flp_receipt",
  // delegation-program sibling PDAs
  buffer: "buffer",
  delegation: "delegation",
  delegationMetadata: "delegation-metadata",
  market: "market",
  // trade / basket layer
  basket: "basket",
  userDepositLedger: "user_deposit_ledger",
  tradeVault: "trade_vault",
  tradeVaultTokenAccount: "trade_vault_token_account",
  withdrawalEscrowReceipt: "withdrawal_escrow_receipt",
  custodySettlementReceipt: "custody_settlement_receipt",
  position: "position",
  order: "order",
  referral: "referral",
  // token staking + rebates (singletons)
  tokenVault: "token_vault",
  tokenVaultTokenAccount: "token_vault_token_account",
  rebateVault: "rebate_vault",
  rebateTokenAccount: "rebate_token_account",
  revenueTokenAccount: "revenue_token_account",
  protocolVault: "protocol_vault",
  protocolTokenAccount: "protocol_token_account",
  // token-stake ER split-flow receipts
  tokenStakeDepositReceipt: "token_stake_deposit_receipt",
  collectRevenueReceipt: "collect_revenue_receipt",
  collectTokenRewardReceipt: "collect_token_reward_receipt",
  collectRebateReceipt: "collect_rebate_receipt",
  settleRebatesReceipt: "settle_rebates_receipt",
  moveProtocolFeesReceipt: "move_protocol_fees_receipt",
  withdrawTokenReceipt: "withdraw_token_receipt",
} as const;

// ---------------------------------------------------------------------------
// Numeric constants (ported from flash-sdk v1)
// ---------------------------------------------------------------------------

export const BN_ZERO = new BN(0);
export const BN_ONE = new BN(1);

export const USD_DECIMALS = 6;
export const USD_POWER = new BN(10).pow(new BN(USD_DECIMALS));

export const BPS_DECIMALS = 4;
export const BPS_POWER = new BN(10).pow(new BN(BPS_DECIMALS));

export const LP_DECIMALS = 6;
export const LP_POWER = new BN(10).pow(new BN(LP_DECIMALS));

export const FAF_DECIMALS = 6;

export const RATE_DECIMALS = 9;
export const RATE_POWER = new BN(10 ** RATE_DECIMALS);

/** Default commit frequency (ms) requested when delegating a per-tx receipt. */
export const DEFAULT_COMMIT_FREQUENCY_MS = 30_000;
