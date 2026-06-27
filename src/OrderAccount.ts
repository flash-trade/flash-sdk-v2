import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Order } from "./types";
import { LimitOrder, TriggerOrder } from "./idl/generatedTypes";

export class OrderAccount implements Order {
  publicKey: PublicKey;

  owner!: PublicKey;
  market!: PublicKey;
  limitOrders!: LimitOrder[];
  takeProfitOrders!: TriggerOrder[];
  stopLossOrders!: TriggerOrder[];
  isInitialised!: boolean;
  isActive!: boolean;
  openSl!: number;
  openTp!: number;
  inactiveSl!: number;
  inactiveTp!: number;
  activeOrders!: number;
  bump!: number;
  referenceTimestamp!: BN;
  executionCount!: BN;
  migrateFlag!: boolean;
  padding!: number[];
  paddingU64!: BN[];

  constructor(publicKey: PublicKey, parseData: Order) {
    this.publicKey = publicKey;
    Object.assign(this, parseData);
  }

  static from(publicKey: PublicKey, parseData: Order): OrderAccount {
    return new OrderAccount(publicKey, parseData);
  }

  updateData(parseData: Order) {
    Object.assign(this, parseData);
  }
}
