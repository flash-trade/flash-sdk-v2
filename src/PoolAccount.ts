import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Pool, Permissions } from "./types";

export class PoolAccount implements Pool {
  publicKey: PublicKey;

  name!: string;
  permissions!: Permissions;
  inceptionTime!: BN;
  lpMint!: PublicKey;
  oracleAuthority!: PublicKey;
  stakedLpVault!: PublicKey;
  rewardCustody!: PublicKey;
  custodies!: PublicKey[];
  ratios!: Pool["ratios"];
  markets!: PublicKey[];
  maxAumUsd!: BN;
  buffer!: BN;
  rawAumUsd!: BN;
  equityUsd!: BN;
  totalStaked!: Pool["totalStaked"];
  stakingFeeShareBps!: BN;
  bump!: number;
  lpMintBump!: number;
  stakedLpVaultBump!: number;
  vpVolumeFactor!: number;
  uniqueCustodyCount!: number;
  padding!: number[];
  stakingFeeBoostBps!: BN[];
  compoundingMint!: PublicKey;
  compoundingLpVault!: PublicKey;
  compoundingStats!: Pool["compoundingStats"];
  compoundingMintBump!: number;
  compoundingLpVaultBump!: number;
  minLpPriceUsd!: BN;
  maxLpPriceUsd!: BN;
  lpPrice!: BN;
  compoundingLpPrice!: BN;
  lastUpdatedTimestamp!: BN;
  feesObligationUsd!: BN;
  rebateObligationUsd!: BN;
  thresholdUsd!: BN;
  lpSupply!: BN;

  constructor(publicKey: PublicKey, parseData: Pool) {
    this.publicKey = publicKey;
    Object.assign(this, parseData);
  }

  static from(publicKey: PublicKey, parseData: Pool): PoolAccount {
    return new PoolAccount(publicKey, parseData);
  }

  updateData(parseData: Pool) {
    Object.assign(this, parseData);
  }

  /** Index of `custodyKey` in the pool's custodies (custody id), or -1. */
  getCustodyId(custodyKey: PublicKey): number {
    return this.custodies.findIndex((c: PublicKey) => c.equals(custodyKey));
  }
}
