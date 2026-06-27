import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Custody, OracleParams, PricingParams, Permissions, Fees, BorrowRateParams } from "./types";

export class CustodyAccount implements Custody {
  publicKey: PublicKey;

  pool!: PublicKey;
  mint!: PublicKey;
  tokenAccount!: PublicKey;
  decimals!: number;
  isStable!: boolean;
  depegAdjustment!: boolean;
  isVirtual!: boolean;
  inversePrice!: boolean;
  oracle!: OracleParams;
  pricing!: PricingParams;
  permissions!: Permissions;
  fees!: Fees;
  borrowRate!: BorrowRateParams;
  tokenAmountMultiplier!: BN;
  assets!: Custody["assets"];
  feesStats!: Custody["feesStats"];
  borrowRateState!: Custody["borrowRateState"];
  bump!: number;
  tokenAccountBump!: number;
  token22!: boolean;
  uid!: number;
  reservedAmount!: BN;
  minReserveUsd!: BN;
  limitPriceBufferBps!: BN;
  tradeReceivable!: BN;
  tradePayable!: BN;
  padding!: number[];

  constructor(publicKey: PublicKey, parseData: Custody) {
    this.publicKey = publicKey;
    Object.assign(this, parseData);
  }

  static from(publicKey: PublicKey, parseData: Custody): CustodyAccount {
    return new CustodyAccount(publicKey, parseData);
  }

  updateData(parseData: Custody) {
    Object.assign(this, parseData);
  }
}
