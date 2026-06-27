import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { BN_ZERO } from "./constants";
import { Basket, PositionMeta, OrderMeta, DepositEntry } from "./types";
import { Ledger } from "./idl/generatedTypes";

/**
 * Runtime wrapper over the on-chain `Basket` account, mirroring the
 * `BasketAccount` class from `@flash_trade/magic-trade-client` so UI code that
 * relied on `.from()` / `getAvailableBalance()` / position helpers keeps working
 * after the migration. The new program renamed `deprecatedDelegate` → `delegate`;
 * a `deprecatedDelegate` getter alias is kept for backwards compatibility.
 */
export class BasketAccount implements Basket {
  publicKey: PublicKey;

  owner!: PublicKey;
  delegate!: PublicKey;
  basketBump!: number;
  padding!: number[];
  positionsActive!: boolean;
  ordersActive!: boolean;
  debits!: Ledger[];
  pendingCredits!: Ledger[];
  positions!: PositionMeta[];
  orders!: OrderMeta[];

  /** @deprecated The basket delegate is now `delegate`; use session keys instead. */
  get deprecatedDelegate(): PublicKey {
    return this.delegate;
  }

  constructor(publicKey: PublicKey, parseData: Basket) {
    this.publicKey = publicKey;
    Object.assign(this, parseData);
  }

  static from(publicKey: PublicKey, parseData: Basket): BasketAccount {
    return new BasketAccount(publicKey, parseData);
  }

  updateData(parseData: Basket) {
    Object.assign(this, parseData);
  }

  getPosition(marketKey: PublicKey): PositionMeta | undefined {
    return this.positions.find(
      (p) => p.market.toBase58() === marketKey.toBase58()
    );
  }

  getOrder(marketKey: PublicKey): OrderMeta | undefined {
    return this.orders.find(
      (o) => o.market.toBase58() === marketKey.toBase58()
    );
  }

  hasOpenPosition(marketKey: PublicKey): boolean {
    const pos = this.getPosition(marketKey);
    return pos !== undefined && !pos.position.sizeAmount.isZero();
  }

  getOpenPositionCount(): number {
    return this.positions.filter((p) => !p.position.sizeAmount.isZero()).length;
  }

  getAvailableBalance(mint: PublicKey, deposits: DepositEntry[]): BN {
    const deposit = deposits.find((d) => d.mint.toBase58() === mint.toBase58());
    const depositAmount = deposit ? deposit.amount : BN_ZERO;
    const credit = this.pendingCredits.find(
      (c) => c.mint.toBase58() === mint.toBase58()
    );
    const creditAmount = credit ? credit.amount : BN_ZERO;
    const debit = this.debits.find(
      (d) => d.mint.toBase58() === mint.toBase58()
    );
    const debitAmount = debit ? debit.amount : BN_ZERO;
    return depositAmount.add(creditAmount).sub(debitAmount);
  }
}
