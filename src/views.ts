import { BN, Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, Transaction, TransactionInstruction,
} from "@solana/web3.js";
import { PoolConfig } from "./PoolConfig";
import { ContractOraclePrice, PositionData, Privilege, Side } from "./types";
import { sideToAnchor } from "./utils";
import { buildAumRemainingAccounts, ro } from "./utils/remainingAccounts";
import { resolveCustody } from "./instructions/common";
import { ViewHelper } from "./ViewHelper";
import { findBasketAddress, findPerpetualsAddress, findPositionAddress } from "./utils";

// ---------------------------------------------------------------------------
// On-chain view / quote functions. Mirrors magic-trade: build the view ix,
// simulate it (raw simulateTransaction via ViewHelper — unbounded wire so large
// account lists work, no signing), and decode the "Program return:" log with
// IdlCoder. Routes to the ER ViewHelper when the client has an ER endpoint
// (delegated pool/custody/market state lives on the ER), else the base helper.
//
// Why not anchor `.view()`: it uses Message.serialize() (2048-byte cap → breaks
// at ~55 keys) and can't target the ER aperture; ViewHelper handles both.
//
// Remaining-account contracts (verified against source):
//   - liquidity / compounding / lp-price: AUM tail [custodies, oracles, markets]
//   - swap: AUM tail [custodies, oracles] (no markets)
//   - open-position quote: optional [existingPosition]
//   - other position quotes: no tail
//
// NOT included: get_assets_under_management / get_oracle_price return Rust
// tuples with no IDL `returns` (the IDL can't describe a tuple); decode those
// via ViewHelper.decodeReturnWithTypedef with a hand-built typedef if needed.
// ---------------------------------------------------------------------------

export class Views {
  /**
   * @param getHelper returns the active ViewHelper — the ER helper when the
   *   client has an ER endpoint (delegated state lives there), else base.
   */
  constructor(
    private readonly program: Program,
    private readonly getHelper: () => ViewHelper,
  ) {}

  private cust(pc: PoolConfig, symbol: string, ext?: boolean) {
    return resolveCustody(pc, symbol, ext);
  }

  /** Build → simulate (unbounded wire, no signing) → decode the return log. */
  private async sim<T>(ixPromise: Promise<TransactionInstruction>, method: string): Promise<T> {
    const helper = this.getHelper();
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_300_000 }),
      await ixPromise,
    );
    const result = await helper.simulateTransaction(tx, [], this.program.provider.publicKey);
    if (result.value.err) {
      throw new Error(`view ${method} simulation failed: ${JSON.stringify(result.value.err)}`);
    }
    const decoded = helper.decodeLogs<T>(result, helper.findInstructionIndex(method), method);
    if (decoded === undefined) throw new Error(`view ${method}: failed to decode return data`);
    return decoded;
  }

  private aum(pc: PoolConfig, includeMarkets: boolean, useExtOracle?: boolean) {
    return buildAumRemainingAccounts(pc, { includeMarkets, useExtOracle });
  }
  private posAccts(pc: PoolConfig, owner: PublicKey, market: PublicKey) {
    return { perpetuals: findPerpetualsAddress(this.program.programId)[0], pool: pc.poolAddress, position: findPositionAddress(owner, market, this.program.programId)[0], market };
  }

  // ----- liquidity (AUM + markets) -----

  getAddLiquidityAmountAndFee(pc: PoolConfig, args: { symbol: string; amountIn: BN; useExtOracle?: boolean }): Promise<any> {
    const c = this.cust(pc, args.symbol, args.useExtOracle);
    return this.sim(this.program.methods.getAddLiquidityAmountAndFee({ amountIn: args.amountIn })
      .accountsPartial({
        perpetuals: findPerpetualsAddress(this.program.programId)[0], pool: pc.poolAddress, custody: c.account,
        custodyOracleAccount: c.oracle, lpTokenMint: pc.stakedLpTokenMint, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .remainingAccounts(this.aum(pc, true, args.useExtOracle)).instruction(), "getAddLiquidityAmountAndFee");
  }

  getRemoveLiquidityAmountAndFee(pc: PoolConfig, args: { symbol: string; lpAmountIn: BN; useExtOracle?: boolean }): Promise<any> {
    const c = this.cust(pc, args.symbol, args.useExtOracle);
    return this.sim(this.program.methods.getRemoveLiquidityAmountAndFee({ lpAmountIn: args.lpAmountIn })
      .accountsPartial({
        perpetuals: findPerpetualsAddress(this.program.programId)[0], pool: pc.poolAddress, custody: c.account,
        custodyOracleAccount: c.oracle, lpTokenMint: pc.stakedLpTokenMint, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .remainingAccounts(this.aum(pc, true, args.useExtOracle)).instruction(), "getRemoveLiquidityAmountAndFee");
  }

  getAddCompoundingLiquidityAmountAndFee(pc: PoolConfig, args: { inSymbol: string; rewardSymbol?: string; amountIn: BN; useExtOracle?: boolean }): Promise<any> {
    const inC = this.cust(pc, args.inSymbol, args.useExtOracle);
    const rw = this.cust(pc, args.rewardSymbol ?? "USDC", args.useExtOracle);
    return this.sim(this.program.methods.getAddCompoundingLiquidityAmountAndFee({ amountIn: args.amountIn })
      .accountsPartial({
        perpetuals: findPerpetualsAddress(this.program.programId)[0], pool: pc.poolAddress,
        inCustody: inC.account, inCustodyOracleAccount: inC.oracle,
        rewardCustody: rw.account, rewardCustodyOracleAccount: rw.oracle,
        lpTokenMint: pc.stakedLpTokenMint, compoundingTokenMint: pc.compoundingTokenMint, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .remainingAccounts(this.aum(pc, true, args.useExtOracle)).instruction(), "getAddCompoundingLiquidityAmountAndFee");
  }

  getRemoveCompoundingLiquidityAmountAndFee(pc: PoolConfig, args: { outSymbol: string; rewardSymbol?: string; compoundingAmountIn: BN; useExtOracle?: boolean }): Promise<any> {
    const outC = this.cust(pc, args.outSymbol, args.useExtOracle);
    const rw = this.cust(pc, args.rewardSymbol ?? "USDC", args.useExtOracle);
    return this.sim(this.program.methods.getRemoveCompoundingLiquidityAmountAndFee({ compoundingAmountIn: args.compoundingAmountIn })
      .accountsPartial({
        perpetuals: findPerpetualsAddress(this.program.programId)[0], pool: pc.poolAddress,
        outCustody: outC.account, outCustodyOracleAccount: outC.oracle,
        rewardCustody: rw.account, rewardCustodyOracleAccount: rw.oracle,
        lpTokenMint: pc.stakedLpTokenMint, compoundingTokenMint: pc.compoundingTokenMint, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .remainingAccounts(this.aum(pc, true, args.useExtOracle)).instruction(), "getRemoveCompoundingLiquidityAmountAndFee");
  }

  getCompoundingTokenData(pc: PoolConfig, useExtOracle?: boolean): Promise<any> {
    return this.sim(this.program.methods.getCompoundingTokenData({})
      .accountsPartial({
        perpetuals: findPerpetualsAddress(this.program.programId)[0], pool: pc.poolAddress,
        lpTokenMint: pc.stakedLpTokenMint, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .remainingAccounts(this.aum(pc, true, useExtOracle)).instruction(), "getCompoundingTokenData");
  }

  /** Returns a BN (u64 fixed-point price). */
  getCompoundingTokenPrice(pc: PoolConfig, useExtOracle?: boolean): Promise<BN> {
    return this.sim(this.program.methods.getCompoundingTokenPrice({})
      .accountsPartial({
        perpetuals: findPerpetualsAddress(this.program.programId)[0], pool: pc.poolAddress,
        lpTokenMint: pc.stakedLpTokenMint, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .remainingAccounts(this.aum(pc, true, useExtOracle)).instruction(), "getCompoundingTokenPrice");
  }

  /** Returns a BN (u64 fixed-point LP price). */
  getLpTokenPrice(pc: PoolConfig, useExtOracle?: boolean): Promise<BN> {
    return this.sim(this.program.methods.getLpTokenPrice({})
      .accountsPartial({
        perpetuals: findPerpetualsAddress(this.program.programId)[0], pool: pc.poolAddress,
        lpTokenMint: pc.stakedLpTokenMint, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .remainingAccounts(this.aum(pc, true, useExtOracle)).instruction(), "getLpTokenPrice");
  }

  // ----- swap (AUM, no markets) -----

  getSwapAmountAndFees(pc: PoolConfig, args: { receivingSymbol: string; dispensingSymbol: string; amountIn: BN; useExtOracle?: boolean }): Promise<any> {
    const recv = this.cust(pc, args.receivingSymbol, args.useExtOracle);
    const disp = this.cust(pc, args.dispensingSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getSwapAmountAndFees({ amountIn: args.amountIn })
      .accountsPartial({
        perpetuals: findPerpetualsAddress(this.program.programId)[0], pool: pc.poolAddress,
        receivingCustody: recv.account, receivingCustodyOracleAccount: recv.oracle,
        dispensingCustody: disp.account, dispensingCustodyOracleAccount: disp.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .remainingAccounts(this.aum(pc, false, args.useExtOracle)).instruction(), "getSwapAmountAndFees");
  }

  // ----- position quotes -----

  getOpenPositionQuote(pc: PoolConfig, args: {
    market: PublicKey; targetSymbol: string; collateralSymbol: string; receivingSymbol: string;
    amountIn: BN; leverage: BN; privilege?: Privilege;
    discountIndex?: number | null; limitPrice?: ContractOraclePrice | null;
    takeProfitPrice?: ContractOraclePrice | null; stopLossPrice?: ContractOraclePrice | null;
    existingPosition?: PublicKey; useExtOracle?: boolean;
  }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    const recv = this.cust(pc, args.receivingSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getOpenPositionQuote({
      amountIn: args.amountIn, leverage: args.leverage, privilege: args.privilege ?? Privilege.None,
      discountIndex: args.discountIndex ?? null, limitPrice: args.limitPrice ?? null,
      takeProfitPrice: args.takeProfitPrice ?? null, stopLossPrice: args.stopLossPrice ?? null,
    })
      .accountsPartial({
        perpetuals: findPerpetualsAddress(this.program.programId)[0], pool: pc.poolAddress, market: args.market,
        targetCustody: t.account, targetOracleAccount: t.oracle,
        collateralCustody: col.account, collateralOracleAccount: col.oracle,
        receivingCustody: recv.account, receivingCustodyOracleAccount: recv.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .remainingAccounts(args.existingPosition ? [ro(args.existingPosition)] : []).instruction(), "getOpenPositionQuote");
  }

  getEntryPriceAndFee(pc: PoolConfig, args: { market: PublicKey; targetSymbol: string; collateralSymbol: string; collateral: BN; size: BN; side: Side; useExtOracle?: boolean }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getEntryPriceAndFee({ collateral: args.collateral, size: args.size, side: sideToAnchor(args.side) })
      .accountsPartial({
        perpetuals: findPerpetualsAddress(this.program.programId)[0], pool: pc.poolAddress, market: args.market,
        targetCustody: t.account, targetOracleAccount: t.oracle,
        collateralCustody: col.account, collateralOracleAccount: col.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getEntryPriceAndFee");
  }

  getClosePositionQuote(pc: PoolConfig, args: {
    owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; dispensingSymbol: string;
    sizeDeltaUsd: BN; privilege?: Privilege; discountIndex?: number | null; triggerPrice?: ContractOraclePrice | null; useExtOracle?: boolean;
  }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    const disp = this.cust(pc, args.dispensingSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getClosePositionQuote({
      sizeDeltaUsd: args.sizeDeltaUsd, privilege: args.privilege ?? Privilege.None,
      discountIndex: args.discountIndex ?? null, triggerPrice: args.triggerPrice ?? null,
    })
      .accountsPartial({
        ...this.posAccts(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        collateralCustody: col.account, collateralOracleAccount: col.oracle,
        dispensingCustody: disp.account, dispensingOracleAccount: disp.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getClosePositionQuote");
  }

  getAddCollateralQuote(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; receivingSymbol: string; amountIn: BN; useExtOracle?: boolean }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    const recv = this.cust(pc, args.receivingSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getAddCollateralQuote({ amountIn: args.amountIn })
      .accountsPartial({
        ...this.posAccts(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        collateralCustody: col.account, collateralOracleAccount: col.oracle,
        receivingCustody: recv.account, receivingOracleAccount: recv.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getAddCollateralQuote");
  }

  getRemoveCollateralQuote(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; dispensingSymbol: string; collateralDeltaUsd: BN; useExtOracle?: boolean }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    const disp = this.cust(pc, args.dispensingSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getRemoveCollateralQuote({ collateralDeltaUsd: args.collateralDeltaUsd })
      .accountsPartial({
        ...this.posAccts(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        collateralCustody: col.account, collateralOracleAccount: col.oracle,
        dispensingCustody: disp.account, dispensingOracleAccount: disp.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getRemoveCollateralQuote");
  }

  getExitPriceAndFee(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; useExtOracle?: boolean }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getExitPriceAndFee({})
      .accountsPartial({
        ...this.posAccts(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        collateralCustody: col.account, collateralOracleAccount: col.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getExitPriceAndFee");
  }

  /** Returns an OraclePrice ({ price, exponent }). */
  getLiquidationPrice(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; useExtOracle?: boolean }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getLiquidationPrice({})
      .accountsPartial({
        ...this.posAccts(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        collateralCustody: col.account, collateralOracleAccount: col.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getLiquidationPrice");
  }

  /** Returns a number (u8 liquidation state). */
  getLiquidationState(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; useExtOracle?: boolean }): Promise<number> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getLiquidationState({})
      .accountsPartial({
        ...this.posAccts(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        collateralCustody: col.account, collateralOracleAccount: col.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getLiquidationState");
  }

  // get_pnl / get_position_data use `custodyOracleAccount` (target oracle) naming.
  getPnl(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; useExtOracle?: boolean }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getPnl({})
      .accountsPartial({
        ...this.posAccts(pc, args.owner, args.market),
        targetCustody: t.account, custodyOracleAccount: t.oracle,
        collateralCustody: col.account, collateralOracleAccount: col.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getPnl");
  }

  getPositionData(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; useExtOracle?: boolean }): Promise<PositionData> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getPositionData({})
      .accountsPartial({
        ...this.posAccts(pc, args.owner, args.market),
        targetCustody: t.account, custodyOracleAccount: t.oracle,
        collateralCustody: col.account, collateralOracleAccount: col.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getPositionData");
  }
  
  private posAcctsEr(pc: PoolConfig, owner: PublicKey, market: PublicKey) {
    return {
      owner,
      perpetuals: findPerpetualsAddress(this.program.programId)[0],
      pool: pc.poolAddress,
      basket: findBasketAddress(owner, this.program.programId)[0],
      market,
    };
  }

  getPositionDataEr(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; useExtOracle?: boolean }): Promise<PositionData> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getPositionDataEr({})
      .accountsPartial({
        ...this.posAcctsEr(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        lockCustody: col.account, lockOracleAccount: col.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getPositionDataEr");
  }

  getPnlEr(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; useExtOracle?: boolean }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getPnlEr({})
      .accountsPartial({
        ...this.posAcctsEr(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        lockCustody: col.account, lockOracleAccount: col.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getPnlEr");
  }

  getExitPriceAndFeeEr(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; useExtOracle?: boolean }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getExitPriceAndFeeEr({})
      .accountsPartial({
        ...this.posAcctsEr(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        lockCustody: col.account, lockOracleAccount: col.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getExitPriceAndFeeEr");
  }

  /** Returns an OraclePrice ({ price, exponent }). */
  getLiquidationPriceEr(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; useExtOracle?: boolean }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getLiquidationPriceEr({})
      .accountsPartial({
        ...this.posAcctsEr(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        lockCustody: col.account, lockOracleAccount: col.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getLiquidationPriceEr");
  }

  /** Returns a number (u8 liquidation state). */
  getLiquidationStateEr(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; useExtOracle?: boolean }): Promise<number> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getLiquidationStateEr({})
      .accountsPartial({
        ...this.posAcctsEr(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        lockCustody: col.account, lockOracleAccount: col.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getLiquidationStateEr");
  }

  getClosePositionQuoteEr(pc: PoolConfig, args: {
    owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; dispensingSymbol: string;
    sizeDeltaUsd: BN; privilege?: Privilege; discountIndex?: number | null; triggerPrice?: ContractOraclePrice | null; useExtOracle?: boolean;
  }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    const disp = this.cust(pc, args.dispensingSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getClosePositionQuoteEr({
      sizeDeltaUsd: args.sizeDeltaUsd, privilege: args.privilege ?? Privilege.None,
      discountIndex: args.discountIndex ?? null, triggerPrice: args.triggerPrice ?? null,
    })
      .accountsPartial({
        ...this.posAcctsEr(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        lockCustody: col.account, lockOracleAccount: col.oracle,
        dispensingCustody: disp.account, dispensingOracleAccount: disp.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getClosePositionQuoteEr");
  }

  getAddCollateralQuoteEr(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; receivingSymbol: string; amountIn: BN; useExtOracle?: boolean }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    const recv = this.cust(pc, args.receivingSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getAddCollateralQuoteEr({ amountIn: args.amountIn })
      .accountsPartial({
        ...this.posAcctsEr(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        lockCustody: col.account, lockOracleAccount: col.oracle,
        receivingCustody: recv.account, receivingOracleAccount: recv.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getAddCollateralQuoteEr");
  }

  getRemoveCollateralQuoteEr(pc: PoolConfig, args: { owner: PublicKey; market: PublicKey; targetSymbol: string; collateralSymbol: string; dispensingSymbol: string; collateralDeltaUsd: BN; useExtOracle?: boolean }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    const disp = this.cust(pc, args.dispensingSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getRemoveCollateralQuoteEr({ collateralDeltaUsd: args.collateralDeltaUsd })
      .accountsPartial({
        ...this.posAcctsEr(pc, args.owner, args.market),
        targetCustody: t.account, targetOracleAccount: t.oracle,
        lockCustody: col.account, lockOracleAccount: col.oracle,
        dispensingCustody: disp.account, dispensingOracleAccount: disp.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getRemoveCollateralQuoteEr");
  }

  getEntryPriceAndFeeEr(pc: PoolConfig, args: { market: PublicKey; targetSymbol: string; collateralSymbol: string; collateral: BN; size: BN; side: Side; useExtOracle?: boolean }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getEntryPriceAndFeeEr({ collateral: args.collateral, size: args.size, side: sideToAnchor(args.side) })
      .accountsPartial({
        perpetuals: findPerpetualsAddress(this.program.programId)[0], pool: pc.poolAddress, market: args.market,
        targetCustody: t.account, targetOracleAccount: t.oracle,
        lockCustody: col.account, lockOracleAccount: col.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      }).instruction(), "getEntryPriceAndFeeEr");
  }

  // Existing-position blending is optional: pass `owner` to blend the caller's
  // existing basket position (the program reads it from remaining_accounts[0]).
  // Omit `owner` for a fresh-position quote.
  getOpenPositionQuoteEr(pc: PoolConfig, args: {
    market: PublicKey; targetSymbol: string; collateralSymbol: string; receivingSymbol: string;
    amountIn: BN; leverage: BN; privilege?: Privilege;
    discountIndex?: number | null; limitPrice?: ContractOraclePrice | null;
    takeProfitPrice?: ContractOraclePrice | null; stopLossPrice?: ContractOraclePrice | null;
    owner?: PublicKey; useExtOracle?: boolean;
  }): Promise<any> {
    const t = this.cust(pc, args.targetSymbol, args.useExtOracle);
    const col = this.cust(pc, args.collateralSymbol, args.useExtOracle);
    const recv = this.cust(pc, args.receivingSymbol, args.useExtOracle);
    return this.sim(this.program.methods.getOpenPositionQuoteEr({
      amountIn: args.amountIn, leverage: args.leverage, privilege: args.privilege ?? Privilege.None,
      discountIndex: args.discountIndex ?? null, limitPrice: args.limitPrice ?? null,
      takeProfitPrice: args.takeProfitPrice ?? null, stopLossPrice: args.stopLossPrice ?? null,
    })
      .accountsPartial({
        perpetuals: findPerpetualsAddress(this.program.programId)[0], pool: pc.poolAddress, market: args.market,
        targetCustody: t.account, targetOracleAccount: t.oracle,
        lockCustody: col.account, lockOracleAccount: col.oracle,
        receivingCustody: recv.account, receivingOracleAccount: recv.oracle, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .remainingAccounts(args.owner ? [ro(findBasketAddress(args.owner, this.program.programId)[0])] : []).instruction(), "getOpenPositionQuoteEr");
  }
}
