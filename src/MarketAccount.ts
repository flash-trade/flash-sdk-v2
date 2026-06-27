import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Market, MarketPermissions } from "./types";
import { PositionStats } from "./idl/generatedTypes";

export class MarketAccount implements Market {
  publicKey: PublicKey;

  pool!: PublicKey;
  targetCustody!: PublicKey;
  collateralCustody!: PublicKey;
  side!: Market["side"];
  correlation!: boolean;
  maxPayoffBps!: BN;
  permissions!: MarketPermissions;
  degenExposureUsd!: BN;
  collectivePosition!: PositionStats;
  targetCustodyUid!: number;
  padding!: number[];
  collateralCustodyUid!: number;
  padding2!: number[];
  bump!: number;

  constructor(publicKey: PublicKey, parseData: Market) {
    this.publicKey = publicKey;
    Object.assign(this, parseData);
  }

  static from(publicKey: PublicKey, parseData: Market): MarketAccount {
    return new MarketAccount(publicKey, parseData);
  }

  updateData(parseData: Market) {
    Object.assign(this, parseData);
  }

  /** The aggregate (collective) position stats for this market. */
  getCollectivePosition(): PositionStats {
    return this.collectivePosition;
  }

  hasOpenPositions(): boolean {
    return this.collectivePosition.openPositions.gt(new BN(0));
  }
}
