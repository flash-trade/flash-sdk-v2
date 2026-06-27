import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { TokenVault } from "./types";
import { TokenPermissions, TokenStakeStats } from "./idl/generatedTypes";

export class TokenVaultAccount implements TokenVault {
  publicKey: PublicKey;

  isInitialized!: boolean;
  bump!: number;
  tokenAccountBump!: number;
  tokenMint!: PublicKey;
  tokenVaultTokenAccount!: PublicKey;
  tokenPermissions!: TokenPermissions;
  withdrawTimeLimit!: BN;
  withdrawInstantFee!: BN;
  withdrawInstantFeeEarned!: BN;
  stakeLevel!: BN[];
  tokensStaked!: TokenStakeStats;
  rewardTokensToDistribute!: BN;
  rewardTokensPaid!: BN;
  tokensToDistribute!: BN;
  tokensDistributed!: BN;
  lastRewardEpochCount!: number;
  rewardTokensDistributed!: BN;
  allowRevenueDistribution!: number;
  padding!: number[];
  revenueTokenAccountBump!: number;
  revenuePerFafStaked!: BN;
  revenueAccrued!: BN;
  revenueDistributed!: BN;
  revenuePaid!: BN;
  unlockPeriod!: BN;
  padding2!: BN[];

  constructor(publicKey: PublicKey, parseData: TokenVault) {
    this.publicKey = publicKey;
    Object.assign(this, parseData);
  }

  static from(publicKey: PublicKey, parseData: TokenVault): TokenVaultAccount {
    return new TokenVaultAccount(publicKey, parseData);
  }

  updateData(parseData: TokenVault) {
    Object.assign(this, parseData);
  }
}
