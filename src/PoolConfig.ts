import { Address } from '@coral-xyz/anchor';
import { Cluster, PublicKey } from '@solana/web3.js';
import poolConfigs from './PoolConfig.json';
import { Side, isVariant } from './types';


export interface CustodyConfig {
  custodyId: number;
  custodyAccount: PublicKey;
  tokenAccount: PublicKey;
  symbol: string;
  mintKey: PublicKey;
  decimals: number;
  usdPrecision: number;
  tokenPrecision: number;
  isStable: boolean;
  isVirtual: boolean;
  intOracleAccount: PublicKey;
  extOracleAccount: PublicKey;
  lazerId: number;
  pythTicker: string;
  pythPriceId: string;
}

export interface MarketConfig {
  marketId: number;
  marketAccount: PublicKey;
  marketCorrelation: boolean;
  pool: PublicKey;
  targetCustody: PublicKey;
  collateralCustody: PublicKey;
  side: Side;
  maxLev: number;
  degenMinLev: number;
  degenMaxLev: number;
  targetCustodyId: number;
  collateralCustodyId: number;
  targetMint: PublicKey;
  collateralMint: PublicKey;
  marketNameUi: string;
}

export type Token = {
  symbol: string;
  fullName: string;
  mintKey: PublicKey;
  decimals: number;
  usdPrecision: number;
  tokenPrecision: number;
  isStable: boolean;
  isVirtual: boolean;
  lazerId: number;
  pythTicker: string;
  pythPriceId: string;
  isToken2022: boolean;
  searchAliases: string[];
  category: string[];
  iconUrl: string;
  marketIconUrl?: string;
};

export class PoolConfig {
  constructor(
    public programId: PublicKey,
    public cluster: Cluster,
    public poolName: string,
    public isDeprecated: boolean,
    public poolAddress: PublicKey,
    public stakedLpTokenMint: PublicKey,
    public compoundingTokenMint: PublicKey,
    public stakedLpVault: PublicKey,
    public compoundingLpVault: PublicKey,
    public lpDecimals: number,
    public compoundingLpTokenSymbol: string,
    public stakedLpTokenSymbol: string,
    public perpetuals: PublicKey,
    public transferAuthority: PublicKey,
    public tokenMint: PublicKey,
    public tokenVault: PublicKey,
    public tokenVaultTokenAccount: PublicKey,
    public rebateVault: PublicKey,
    public rebateTokenAccount: PublicKey,
    public revenueTokenAccount: PublicKey,
    public protocolVault: PublicKey,
    public protocolTokenAccount: PublicKey,
    public multisig: PublicKey,
    public addressLookupTableAddresses: PublicKey[],
    public pusherAddressLookupTableAddress: PublicKey,
    public backupOracle: PublicKey,

    public tokens: Token[],

    public tokensDeprecated: Token[],

    public custodies: CustodyConfig[],

    public custodiesDeprecated: CustodyConfig[],

    public markets: MarketConfig[],

    public marketsDeprecated: MarketConfig[],

    public isMagicBlock: boolean = false,
    public poolId: number = 0,
    public compoundingLpIconUrl?: string,
    public stakedLpIconUrl?: string,
  ) { }

  public getAllTokenMints(): PublicKey[] {
    const tokenList =  Array.from(
      this.tokens.map((token) => new PublicKey(token.mintKey)),
    );
    const deprecatedTokenList =  Array.from(
      this.tokensDeprecated.map((token) => new PublicKey(token.mintKey)),
    );
    return tokenList.concat(deprecatedTokenList);
  }

  public getMarketConfigByPk(marketAccountPk: PublicKey): MarketConfig {
    let market = this.markets.find(f => f.marketAccount.equals(marketAccountPk));
    if(!market) {
      // check in deprecated markets
      market = this.marketsDeprecated.find(f => f.marketAccount.equals(marketAccountPk));
    }
    if(!market) throw new Error(`No such market ${marketAccountPk.toBase58()} exists.`)
    return market
  }

  public getMarketConfig(
    targetCustody: PublicKey,
    collateralCustody: PublicKey,
    side: Side): MarketConfig | null {
    const marketAccountPk = this.getMarketPk(targetCustody, collateralCustody, side)
    let market = this.markets.find(f => f.marketAccount.equals(marketAccountPk));
    if(!market) {
      // check in deprecated markets
      market = this.marketsDeprecated.find(f => f.marketAccount.equals(marketAccountPk));
    }
    if(!market) return null
    // better to return NULL so that we can handle on UI , since difficult to validate each input
    // if(!market) throw new Error(`No such market : ${marketAccountPk.toBase58()} target:${targetCustody.toBase58()} collateral:${collateralCustody.toBase58()} side:${side} exists.`)
    return market
  }

  public getMarketPk(
    targetCustody: PublicKey,
    collateralCustody: PublicKey,
    side: Side
  ): PublicKey {
    return PublicKey.findProgramAddressSync([
      Buffer.from('market'),
      targetCustody.toBuffer(),
      collateralCustody.toBuffer(),
      Buffer.from([isVariant(side, 'long') ? 1 : 2])
    ], this.programId)[0]
  }

  public getPositionFromMarketPk(
    owner: PublicKey,
    marketAccount : PublicKey,
  ): PublicKey {
    return PublicKey.findProgramAddressSync([
      Buffer.from("position"),
      owner.toBuffer(),
      marketAccount.toBuffer(),
    ], this.programId)[0]
  }

  public getOrderFromMarketPk(
    owner: PublicKey,
    marketAccount : PublicKey,
  ): PublicKey {
    return PublicKey.findProgramAddressSync([
      Buffer.from("order"),
      owner.toBuffer(),
      marketAccount.toBuffer(),
    ], this.programId)[0]
  }

  public getPositionFromCustodyPk(
    owner: PublicKey,
    targetCustody : PublicKey,
    collateralCustody : PublicKey,
    side: Side
  ): PublicKey {
    return PublicKey.findProgramAddressSync([
      Buffer.from("position"),
      owner.toBuffer(),
       this.getMarketPk(targetCustody, collateralCustody, side).toBuffer(),
    ], this.programId)[0]
  }

  public getOrderFromCustodyPk(
    owner: PublicKey,
    targetCustody : PublicKey,
    collateralCustody : PublicKey,
    side: Side
  ): PublicKey {
    return PublicKey.findProgramAddressSync([
      Buffer.from("order"),
      owner.toBuffer(),
      this.getMarketPk(targetCustody, collateralCustody, side).toBuffer(),
    ], this.programId)[0]
  }

  public doesMarketExist(pubkey: PublicKey): boolean {
    return (
      this.markets.some((m) => m.marketAccount.equals(pubkey)) ||
      this.marketsDeprecated.some((m) => m.marketAccount.equals(pubkey))
    );
  }

  public getAllMarketPks(): PublicKey[] {
    // don't return deprecated markets here 
    return this.markets.map(m => m.marketAccount);
  }

  public getNonStableTokens(): PublicKey[] {
    return Array.from(
      this.tokens
        .filter((token) => !token.isStable)
        .map((token) => new PublicKey(token.mintKey)),
    );
  }

  public getAllCustodies(): PublicKey[] {
    return Array.from(
      this.custodies.map((custody) => new PublicKey(custody.custodyAccount)),
    );
  }

  public getNonStableCustodies(): PublicKey[] {
    return Array.from(
      this.custodies
        .filter((custody) => !custody.isStable)
        .map((custody) => new PublicKey(custody.custodyAccount)),
    );
  }


  public getTokenFromSymbol = (symbol: string) : Token => {
    return this.tokens.find(f => f.symbol.toUpperCase() === symbol.toUpperCase())!;
  }

  public getTokenFromMintString = (mint: string) : Token => {
      return this.tokens.find(f => f.mintKey.toBase58() === mint)!;
  }

  public getTokenFromMintPk = (mint: PublicKey) : Token => {
      return this.tokens.find(f => f.mintKey.equals(mint))!;
  }


  // static getAllPoolConfigs(cluster: Cluster): PoolConfig[] {
  //   return poolConfigs.pools.map(p => this.fromIdsByName(p.poolName, cluster))
  // }

  static getCustodyConfig(custodyAccountPk: Address, poolName: string, cluster: Cluster) : CustodyConfig {
    return this.fromIdsByName(poolName, cluster).custodies.find(f => f.custodyAccount.toBase58() === custodyAccountPk.toString())
  }

  public getCustodyIdFromCustodyAccount(custodyAccountPk: Address): number {
    return this.custodies.find(f => f.custodyAccount.toBase58() === custodyAccountPk.toString()).custodyId;
  }

  public getCustodyAccountFromCustodyId(custodyId: number): PublicKey {
    return this.custodies.find(f => f.custodyId === custodyId).custodyAccount;
  }

  static getTokensInPool(name: string, cluster: Cluster): Token[] {
    const poolConfig = poolConfigs.pools.find((pool) => pool['poolName'] === name && cluster === pool['cluster']);
    if (!poolConfig) throw new Error(`No pool config ${name} found in Ids!`);
    const tokens :Token[] = poolConfig['tokens'].map(i => {
      return {
        ...i,
        mintKey: new PublicKey(i.mintKey),
        isToken2022: i.isToken2022 ?? false,
      }
    })
    return tokens
  }

  /**
   * Top-level non-pool tokens — display/search metadata only (placeholder
   * mints, no custody). Covers other FLP variants, forex/commodities and
   * memecoins surfaced in token-search UIs. Missing display fields are
   * defaulted from the symbol.
   */
  static getOtherTokens(): Token[] {
    const list = ((poolConfigs as any).otherTokens ?? []) as any[];
    return list.map((i) => ({
      ...i,
      mintKey: new PublicKey(i.mintKey),
      isToken2022: i.isToken2022 ?? false,
      fullName: i.fullName ?? i.symbol,
      searchAliases: i.searchAliases ?? [String(i.symbol).toLowerCase()],
      category: i.category ?? [],
    }));
  }

  static buildPoolconfigFromJson(poolConfig: typeof poolConfigs['pools'][0]): PoolConfig {
    const compactPoolConfig = poolConfig as any;

    let tokens: Token[] ;
    try {
      tokens = poolConfig['tokens'].map(i => {
        return {
          ...i,
          mintKey: new PublicKey(i.mintKey),
          isToken2022: i.isToken2022 ?? false,
        }
      })
      
    } catch (error) {
      console.log("ERROR: buildPoolconfigFromJson  unable to load tokens ")
    }


    let tokensDeprecated: Token[] ;
    try {
      if (!compactPoolConfig.tokensDeprecated) {
        tokensDeprecated = []
      } else {
        tokensDeprecated = compactPoolConfig.tokensDeprecated.map(i => {
          return {
            ...i,
            mintKey: new PublicKey(i.mintKey),
            isToken2022: i.isToken2022 ?? false,
          }
        })
      }
    } catch (error) {
      console.log("ERROR: buildPoolconfigFromJson  unable to load tokensDeprecated ")
    }


    let custodies: CustodyConfig[];
    try {
      custodies = compactPoolConfig.custodies.map((i, index) => {
        const intOracleAccount = new PublicKey(i.intOracleAddress);
        return {
          ...i,
          custodyId: i.custodyId,
          custodyAccount: new PublicKey(i.custodyAccount),
          tokenAccount: new PublicKey(i.tokenAccount),
          mintKey: new PublicKey(i.mintKey),
          intOracleAccount,
          extOracleAccount: new PublicKey(i.extOracleAddress),
        }
      })
      
    } catch (error) {
      console.log("ERROR: buildPoolconfigFromJson  unable to load custodies ")
    }

    let custodiesDeprecated: CustodyConfig[]
    try {
      if (!compactPoolConfig.custodiesDeprecated) {
        custodiesDeprecated = []
      } else {
        custodiesDeprecated = compactPoolConfig.custodiesDeprecated.map((i, index) => {
          const intOracleAccount = new PublicKey(i.intOracleAddress);
          return {
            ...i,
            custodyId: i.custodyId,
            custodyAccount: new PublicKey(i.custodyAccount),
            tokenAccount: new PublicKey(i.tokenAccount),
            mintKey: new PublicKey(i.mintKey),
            intOracleAccount,
            extOracleAccount: new PublicKey(i.extOracleAddress),
          }
        })
      }
    } catch (error) {
      console.log("ERROR: buildPoolconfigFromJson  unable to load custodiesDeprecated ")
    }


    let addressLookupTableAddresses: PublicKey[]
    try {
      addressLookupTableAddresses  = poolConfig['addressLookupTableAddresses'].map(i => {
        return new PublicKey(i)
      });
    } catch (error) {
      console.log("ERROR: buildPoolconfigFromJson  unable to load addressLookupTableAddresses ")
    }
   
    let pusherAddressLookupTableAddress: PublicKey
    try {
          pusherAddressLookupTableAddress = new PublicKey(poolConfig['pusherAddressLookupTableAddress']);
    } catch (error) {
      console.log("ERROR: buildPoolconfigFromJson  unable to load pusherAddressLookupTableAddress ")
    }

    let markets: MarketConfig[]
    try {
      markets  = compactPoolConfig.markets.map((i) => {
        const targetCustody = new PublicKey(i.targetCustody);
        const collateralCustody = new PublicKey(i.collateralCustody);
        return {
          ...i,
          marketId: i.marketId,
          marketAccount: new PublicKey(i.marketAccount),
          marketCorrelation : i.marketCorrelation,
          pool: new PublicKey(i.pool),
          targetCustody,
          collateralCustody,
          side: i.side === 'long' ? Side.Long : Side.Short,
          maxLev: i.maxLev,
          degenMinLev: i.degenMinLev,
          degenMaxLev: i.degenMaxLev,
          targetCustodyId: i.targetCustodyId,
          collateralCustodyId: i.collateralCustodyId,
          targetMint: new PublicKey(i.targetMint),
          collateralMint: new PublicKey(i.collateralMint)
        }
      });
    } catch (error) {
      console.log("ERROR: buildPoolconfigFromJson  unable to load markets ")
    }

    let marketsDeprecated: MarketConfig[]
    try {
      if (!compactPoolConfig.marketsDeprecated) {
        marketsDeprecated = []
      } else {
        marketsDeprecated  = compactPoolConfig.marketsDeprecated.map((i) => {
          const targetCustody = new PublicKey(i.targetCustody);
          const collateralCustody = new PublicKey(i.collateralCustody);
          return {
            ...i,
            marketId: i.marketId,
            marketAccount: new PublicKey(i.marketAccount),
            marketCorrelation : i.marketCorrelation,
            pool: new PublicKey(i.pool),
            targetCustody,
            collateralCustody,
            side: i.side === 'long' ? Side.Long : Side.Short,
            maxLev: i.maxLev,
            degenMinLev: i.degenMinLev,
            degenMaxLev: i.degenMaxLev,
            targetCustodyId: i.targetCustodyId,
            collateralCustodyId: i.collateralCustodyId,
            targetMint: new PublicKey(i.targetMint),
            collateralMint: new PublicKey(i.collateralMint)
          }
        });
      }
    } catch (error) {
      console.log("ERROR: buildPoolconfigFromJson  unable to load markets ")
    }

    return new PoolConfig(
      new PublicKey(poolConfig.programId),
      poolConfig.cluster as Cluster,
      poolConfig.poolName,
      poolConfig.isDeprecated,
      new PublicKey(poolConfig.poolAddress),
      new PublicKey(poolConfig.stakedLpTokenMint),
      new PublicKey(poolConfig.compoundingTokenMint),
      new PublicKey(poolConfig.stakedLpVault),
      new PublicKey(poolConfig.compoundingLpVault),
      poolConfig.lpDecimals,
      poolConfig.compoundingLpTokenSymbol,
      poolConfig.stakedLpTokenSymbol,
      new PublicKey(poolConfig.perpetuals),
      new PublicKey(poolConfig.transferAuthority),
      new PublicKey(poolConfig.tokenMint),
      new PublicKey(poolConfig.tokenVault),
      new PublicKey(poolConfig.tokenVaultTokenAccount),
      new PublicKey(poolConfig.rebateVault),
      new PublicKey(poolConfig.rebateTokenAccount),
      new PublicKey(poolConfig.revenueTokenAccount),
      new PublicKey(poolConfig.protocolVault),
      new PublicKey(poolConfig.protocolTokenAccount),
      new PublicKey(poolConfig.multisig),
      addressLookupTableAddresses,
      pusherAddressLookupTableAddress,
      new PublicKey(poolConfig.backupOracle),
      tokens,
      tokensDeprecated,
      custodies,
      custodiesDeprecated,
      markets,
      marketsDeprecated,
      !!compactPoolConfig.isMagicBlock,
      compactPoolConfig.poolId,
      compactPoolConfig.compoundingLpIconUrl,
      compactPoolConfig.stakedLpIconUrl,
    );
  }

  static fromIdsByName(name: string, cluster: Cluster): PoolConfig {
    const poolConfig = poolConfigs.pools.find((pool) => pool['poolName'] === name && cluster === pool['cluster']);
    if (!poolConfig) {
      throw new Error(`No pool with ${name} found!`);
    }

    return PoolConfig.buildPoolconfigFromJson(poolConfig);
  }

  static fromIdsByPk(poolPk: PublicKey, cluster: Cluster): PoolConfig {
    const poolConfig = poolConfigs.pools.find(
      (pool) => pool['poolAddress'] === poolPk.toString() && cluster === pool['cluster'],
    );
    if (!poolConfig) {
      throw new Error(`No pool with ${poolPk.toString()} found!`);
    }

    return PoolConfig.buildPoolconfigFromJson(poolConfig)
  }
}
