import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findPerpetualsAddress,
  findPoolAddress,
  findCustodyAddress,
  findMarketAddress,
  findBasketAddress,
  findUserDepositLedgerAddress,
  findTokenStakeAddress,
  findTokenVaultAddress,
} from "./utils";
import {
  Pool,
  Custody,
  Market,
  Basket,
  UserDepositLedger,
  TokenStake,
  TokenVault,
  Side,
} from "./types";
import { Perpetuals } from "./idl/generatedTypes";
import { PoolAccount } from "./PoolAccount";
import { CustodyAccount } from "./CustodyAccount";
import { MarketAccount } from "./MarketAccount";
import { BasketAccount } from "./BasketAccount";
import { TokenStakeAccount } from "./TokenStakeAccount";
import { TokenVaultAccount } from "./TokenVaultAccount";

export class AccountFetcher {
  constructor(private program: Program) {}

  private get programId(): PublicKey {
    return this.program.programId;
  }

  private account(name: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.program.account as any)[name];
  }

  async fetchPerpetuals(): Promise<Perpetuals> {
    const [address] = findPerpetualsAddress(this.programId);
    return (await this.account("perpetuals").fetch(address)) as Perpetuals;
  }

  async fetchPool(name: string): Promise<PoolAccount> {
    const [address] = findPoolAddress(name, this.programId);
    const data = (await this.account("pool").fetch(address)) as Pool;
    return PoolAccount.from(address, data);
  }

  async fetchCustody(pool: PublicKey, mint: PublicKey): Promise<CustodyAccount> {
    const [address] = findCustodyAddress(pool, mint, this.programId);
    const data = (await this.account("custody").fetch(address)) as Custody;
    return CustodyAccount.from(address, data);
  }

  async fetchMarket(
    targetCustody: PublicKey,
    collateralCustody: PublicKey,
    side: Side
  ): Promise<MarketAccount> {
    const [address] = findMarketAddress(
      targetCustody,
      collateralCustody,
      side,
      this.programId
    );
    const data = (await this.account("market").fetch(address)) as Market;
    return MarketAccount.from(address, data);
  }

  async fetchBasket(owner: PublicKey): Promise<BasketAccount> {
    const [address] = findBasketAddress(owner, this.programId);
    const data = (await this.account("basket").fetch(address)) as Basket;
    return BasketAccount.from(address, data);
  }

  async fetchTokenStake(owner: PublicKey): Promise<TokenStakeAccount> {
    const [address] = findTokenStakeAddress(owner, this.programId);
    const data = (await this.account("tokenStake").fetch(address)) as TokenStake;
    return TokenStakeAccount.from(address, data);
  }

  /** Global FAF token vault (singleton PDA). May be delegated to the ER — fetch
   *  via the ER AccountFetcher when delegated to read live state. */
  async fetchTokenVault(): Promise<TokenVaultAccount> {
    const [address] = findTokenVaultAddress(this.programId);
    const data = (await this.account("tokenVault").fetch(address)) as TokenVault;
    return TokenVaultAccount.from(address, data);
  }

  async fetchUserDepositLedger(owner: PublicKey): Promise<UserDepositLedger> {
    const [address] = findUserDepositLedgerAddress(owner, this.programId);
    return (await this.account("userDepositLedger").fetch(
      address
    )) as UserDepositLedger;
  }

  async fetchAllMarkets(poolName: string): Promise<MarketAccount[]> {
    const pool = await this.fetchPool(poolName);
    const results: MarketAccount[] = [];
    for (const marketKey of pool.markets) {
      if (marketKey.equals(PublicKey.default)) continue;
      const data = (await this.account("market").fetch(marketKey)) as Market;
      results.push(MarketAccount.from(marketKey, data));
    }
    return results;
  }

  async fetchAllCustodies(poolName: string): Promise<CustodyAccount[]> {
    const pool = await this.fetchPool(poolName);
    const results: CustodyAccount[] = [];
    for (const custodyKey of pool.custodies) {
      if (custodyKey.equals(PublicKey.default)) continue;
      const data = (await this.account("custody").fetch(custodyKey)) as Custody;
      results.push(CustodyAccount.from(custodyKey, data));
    }
    return results;
  }
}
