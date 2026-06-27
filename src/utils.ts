import { PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import BN from "bn.js";
import {
  PERPETUALS_PROGRAM_ID,
  DELEGATION_PROGRAM_ID,
  SESSION_KEYS_PROGRAM_ID,
  SESSION_TOKEN_SEED,
  SEEDS,
  USD_DECIMALS,
} from "./constants";
import { ContractOraclePrice, Side, isVariant, sideToByte } from "./types";

const enc = (s: string) => Buffer.from(s);
type Pda = [PublicKey, number];

const find = (seeds: (Buffer | Uint8Array)[], programId: PublicKey): Pda =>
  PublicKey.findProgramAddressSync(seeds, programId);

// ---------------------------------------------------------------------------
// PDA derivation — byte-exact with the on-chain perpetuals program. Mirrors the
// `findXAddress` free-function convention; each returns [address, bump].
// ---------------------------------------------------------------------------

// --- singletons ---

const perpetualsAddressCache = new Map<string, Pda>();
export function findPerpetualsAddress(
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  const key = programId.toBase58();
  let cached = perpetualsAddressCache.get(key);
  if (!cached) {
    cached = find([enc(SEEDS.perpetuals)], programId);
    perpetualsAddressCache.set(key, cached);
  }
  return cached;
}

export function findTransferAuthorityAddress(
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.transferAuthority)], programId);
}

export function findMultisigAddress(
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.multisig)], programId);
}

export function findEventAuthorityAddress(
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.eventAuthority)], programId);
}

export function findReallocVaultAddress(
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.reallocVault)], programId);
}

export function findMagicFeeVaultAddress(validator: PublicKey): Pda {
  return find([enc("magic-fee-vault"), validator.toBuffer()], DELEGATION_PROGRAM_ID);
}

export function findTokenVaultAddress(
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.tokenVault)], programId);
}

export function findTokenVaultTokenAccountAddress(
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.tokenVaultTokenAccount)], programId);
}

export function findRebateVaultAddress(
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.rebateVault)], programId);
}

export function findRebateTokenAccountAddress(
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.rebateTokenAccount)], programId);
}

export function findProtocolVaultAddress(
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.protocolVault)], programId);
}

export function findProtocolTokenAccountAddress(
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.protocolTokenAccount)], programId);
}

// --- pool / custody / market ---

export function findPoolAddress(
  name: string,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.pool), enc(name)], programId);
}

export function findCustodyAddress(
  pool: PublicKey,
  mint: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.custody), pool.toBuffer(), mint.toBuffer()], programId);
}

export function findCustodyTokenAccountAddress(
  pool: PublicKey,
  mint: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.custodyTokenAccount), pool.toBuffer(), mint.toBuffer()],
    programId,
  );
}

export function findMarketAddress(
  targetCustody: PublicKey,
  collateralCustody: PublicKey,
  side: Side,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [
      enc(SEEDS.market),
      targetCustody.toBuffer(),
      collateralCustody.toBuffer(),
      Buffer.from([sideToByte(side)]),
    ],
    programId,
  );
}

export function findInternalOracleAddress(
  mint: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.oracleAccount), mint.toBuffer()], programId);
}

export function findWhitelistAddress(
  owner: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.whitelist), owner.toBuffer()], programId);
}

// --- staking ---

export function findFlpStakeAddress(
  owner: PublicKey,
  pool: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.stake), owner.toBuffer(), pool.toBuffer()], programId);
}

export function findTokenStakeAddress(
  owner: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc("token_stake"), owner.toBuffer()], programId);
}

export function findStakedLpVaultAddress(
  pool: PublicKey,
  lpMint: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.stakedLpTokenAccount), pool.toBuffer(), lpMint.toBuffer()],
    programId,
  );
}

// --- receipts (ER split flows) ---

export function findSwapReceiptAddress(
  owner: PublicKey,
  inMint: PublicKey,
  outMint: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.swapReceipt), owner.toBuffer(), inMint.toBuffer(), outMint.toBuffer()],
    programId,
  );
}

export function findStakingDepositReceiptAddress(
  owner: PublicKey,
  custodyMint: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.stakingDepositReceipt), owner.toBuffer(), custodyMint.toBuffer()],
    programId,
  );
}

export function findStakingWithdrawReceiptAddress(
  owner: PublicKey,
  custodyMint: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.stakingWithdrawReceipt), owner.toBuffer(), custodyMint.toBuffer()],
    programId,
  );
}

export function findCompDepositReceiptAddress(
  owner: PublicKey,
  inCustodyMint: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.compDepositReceipt), owner.toBuffer(), inCustodyMint.toBuffer()],
    programId,
  );
}

export function findCompWithdrawReceiptAddress(
  owner: PublicKey,
  outCustodyMint: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.compWithdrawReceipt), owner.toBuffer(), outCustodyMint.toBuffer()],
    programId,
  );
}

export function findCollectStakeRewardReceiptAddress(
  owner: PublicKey,
  pool: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.collectStakeRewardReceipt), owner.toBuffer(), pool.toBuffer()],
    programId,
  );
}

export function findCompoundFeesReceiptAddress(
  keeper: PublicKey,
  pool: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.compoundFeesReceipt), keeper.toBuffer(), pool.toBuffer()],
    programId,
  );
}

export function findMigrateStakeReceiptAddress(
  owner: PublicKey,
  pool: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.migrateStakeReceipt), owner.toBuffer(), pool.toBuffer()],
    programId,
  );
}

export function findMigrateFlpReceiptAddress(
  owner: PublicKey,
  pool: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.migrateFlpReceipt), owner.toBuffer(), pool.toBuffer()],
    programId,
  );
}

// --- token-stake ER split-flow receipts (owner-scoped) ---

export function findTokenStakeDepositReceiptAddress(
  owner: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.tokenStakeDepositReceipt), owner.toBuffer()],
    programId,
  );
}

export function findCollectRevenueReceiptAddress(
  owner: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.collectRevenueReceipt), owner.toBuffer()],
    programId,
  );
}

export function findCollectTokenRewardReceiptAddress(
  owner: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.collectTokenRewardReceipt), owner.toBuffer()],
    programId,
  );
}

export function findCollectRebateReceiptAddress(
  owner: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.collectRebateReceipt), owner.toBuffer()],
    programId,
  );
}

/** settle_rebates receipt — keyed by [keeper, pool] (a keeper/pool op, not
 *  per-owner like the collect_* receipts). */
export function findSettleRebatesReceiptAddress(
  keeper: PublicKey,
  pool: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.settleRebatesReceipt), keeper.toBuffer(), pool.toBuffer()],
    programId,
  );
}

/** move_protocol_fees receipt — keyed by [keeper, pool] (a keeper/pool op). */
export function findMoveProtocolFeesReceiptAddress(
  keeper: PublicKey,
  pool: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.moveProtocolFeesReceipt), keeper.toBuffer(), pool.toBuffer()],
    programId,
  );
}

export function findWithdrawTokenReceiptAddress(
  owner: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.withdrawTokenReceipt), owner.toBuffer()],
    programId,
  );
}

// --- revenue vault token account (singleton) ---

export function findRevenueTokenAccountAddress(
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.revenueTokenAccount)], programId);
}

// --- trade / basket layer ---

export function findBasketAddress(
  owner: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.basket), owner.toBuffer()], programId);
}

export function findUserDepositLedgerAddress(
  owner: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.userDepositLedger), owner.toBuffer()], programId);
}

export function findTradeVaultAddress(
  tokenMint: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.tradeVault), tokenMint.toBuffer()], programId);
}

export function findTradeVaultTokenAccountAddress(
  tokenMint: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.tradeVaultTokenAccount), tokenMint.toBuffer()], programId);
}

export function findWithdrawalEscrowReceiptAddress(
  owner: PublicKey,
  tokenMint: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find(
    [enc(SEEDS.withdrawalEscrowReceipt), owner.toBuffer(), tokenMint.toBuffer()],
    programId,
  );
}

export function findCustodySettlementReceiptAddress(
  custody: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.custodySettlementReceipt), custody.toBuffer()], programId);
}

export function findPositionAddress(
  owner: PublicKey,
  market: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.position), owner.toBuffer(), market.toBuffer()], programId);
}

export function findOrderAddress(
  owner: PublicKey,
  market: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.order), owner.toBuffer(), market.toBuffer()], programId);
}

export function findReferralAddress(
  owner: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): Pda {
  return find([enc(SEEDS.referral), owner.toBuffer()], programId);
}

// --- session keys (external MagicBlock Session Keys program) ---

export function findSessionTokenAddress(
  targetProgram: PublicKey,
  sessionSigner: PublicKey,
  authority: PublicKey,
): Pda {
  return find(
    [
      enc(SESSION_TOKEN_SEED),
      targetProgram.toBuffer(),
      sessionSigner.toBuffer(),
      authority.toBuffer(),
    ],
    SESSION_KEYS_PROGRAM_ID,
  );
}

// --- delegation siblings ---

export interface DelegationSiblings {
  pda: PublicKey;
  buffer: PublicKey;
  delegationRecord: PublicKey;
  delegationMetadata: PublicKey;
}

/** The 3 sibling PDAs the delegation CPI requires for `pda`. */
export function findDelegationSiblings(
  pda: PublicKey,
  programId: PublicKey = PERPETUALS_PROGRAM_ID,
): DelegationSiblings {
  return {
    pda,
    buffer: find([enc(SEEDS.buffer), pda.toBuffer()], programId)[0],
    delegationRecord: find([enc(SEEDS.delegation), pda.toBuffer()], DELEGATION_PROGRAM_ID)[0],
    delegationMetadata: find(
      [enc(SEEDS.delegationMetadata), pda.toBuffer()],
      DELEGATION_PROGRAM_ID,
    )[0],
  };
}

// ---------------------------------------------------------------------------
// Anchor helpers
// ---------------------------------------------------------------------------

export function anchorDiscriminator(methodName: string): Buffer {
  return createHash("sha256").update(`global:${methodName}`).digest().subarray(0, 8);
}

// ---------------------------------------------------------------------------
// Price helpers
// ---------------------------------------------------------------------------

export function oraclePrice(price: number, exponent: number): ContractOraclePrice {
  return { price: new BN(price), exponent };
}

export function priceToUsd(p: ContractOraclePrice): number {
  return p.price.toNumber() * Math.pow(10, p.exponent);
}

const USD_POWER = new BN(10).pow(new BN(USD_DECIMALS));

export function usdToNative(usdAmount: number): BN {
  return new BN(Math.round(usdAmount * USD_POWER.toNumber()));
}

export function nativeToUsd(amount: BN): number {
  return amount.toNumber() / USD_POWER.toNumber();
}

// ---------------------------------------------------------------------------
// Side helpers
// ---------------------------------------------------------------------------

export function sideToAnchor(side: Side): object {
  if (isVariant(side, "long")) return { long: {} };
  if (isVariant(side, "short")) return { short: {} };
  return { none: {} };
}

export * from "./utils/math";
