import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Position } from "./types";
import { OraclePrice } from "./idl/generatedTypes";

export class PositionAccount implements Position {
  publicKey: PublicKey;

  owner!: PublicKey;
  market!: PublicKey;
  delegate!: PublicKey;
  openTime!: BN;
  updateTime!: BN;
  entryPrice!: OraclePrice;
  sizeAmount!: BN;
  sizeUsd!: BN;
  lockedAmount!: BN;
  lockedUsd!: BN;
  priceImpactUsd!: BN;
  collateralUsd!: BN;
  unsettledValueUsd!: BN;
  unsettledFeesUsd!: BN;
  cumulativeLockFeeSnapshot!: BN;
  degenSizeUsd!: BN;
  referencePrice!: OraclePrice;
  isActive!: boolean;
  buffer!: number[];
  priceImpactSet!: number;
  sizeDecimals!: number;
  lockedDecimals!: number;
  collateralDecimals!: number;
  bump!: number;
  migrateFlag!: boolean;
  padding!: number[];

  constructor(publicKey: PublicKey, parseData: Position) {
    this.publicKey = publicKey;
    Object.assign(this, parseData);
  }

  static from(publicKey: PublicKey, parseData: Position): PositionAccount {
    return new PositionAccount(publicKey, parseData);
  }

  updateData(parseData: Position) {
    Object.assign(this, parseData);
  }

  isDegenMode(): boolean {
    return this.degenSizeUsd.gte(this.sizeUsd);
  }
}
