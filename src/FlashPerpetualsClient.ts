import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Commitment,
  TransactionInstruction,
  Signer,
  Keypair,
  AccountInfo,
  SystemProgram,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeAccount3Instruction,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import BN from "bn.js";

import idlJson from "./idl/perpetuals.json";
import { AccountFetcher } from "./accounts";
import { ViewHelper } from "./ViewHelper";
import { Views } from "./views";
import { PoolConfig, CustodyConfig, MarketConfig } from "./PoolConfig";
import { DELEGATION_PROGRAM_ID, BN_ZERO, BPS_DECIMALS } from "./constants";
import {
  InstructionResult,
  Side,
  ContractOraclePrice,
  Privilege,
  isVariant,
} from "./types";
import {
  findBasketAddress,
  findSessionTokenAddress,
  findTradeVaultAddress,
  findUserDepositLedgerAddress,
  findCustodySettlementReceiptAddress,
  findFlpStakeAddress,
  findTokenStakeAddress,
  checkedDecimalCeilMul,
} from "./utils";
import * as instructions from "./instructions";
import {
  sendBaseTransaction,
  confirmBaseTransaction,
  SendTransactionOpts,
} from "./utils/rpc";
import {
  sendErTransactionLegacy,
  SendErOpts,
  SendErResult,
} from "./utils/erRpc";
import { awaitReceiptOutcome, awaitClosed, ReceiptOutcome } from "./accounts/receipts";

// WithAction (validator-orchestrated) flows + their arg types.
import { buildSwapWithAction, SwapWithActionArgs } from "./instructions/trade/swapWithAction";
import { buildAddLiquidityAndStakeWithAction, AddLiquidityAndStakeArgs } from "./instructions/lp/addLiquidityAndStakeWithAction";
import { buildRemoveLiquidityWithAction, RemoveLiquidityArgs } from "./instructions/lp/removeLiquidityWithAction";
import { buildAddCompoundingLiquidityWithAction, AddCompoundingLiquidityArgs } from "./instructions/lp/addCompoundingLiquidityWithAction";
import { buildRemoveCompoundingLiquidityWithAction, RemoveCompoundingLiquidityArgs } from "./instructions/lp/removeCompoundingLiquidityWithAction";
import { buildAddCompoundingLiquidityEr, AddCompoundingLiquidityErArgs } from "./instructions/lp/addCompoundingLiquidityEr";
import { buildRemoveCompoundingLiquidityEr, RemoveCompoundingLiquidityErArgs } from "./instructions/lp/removeCompoundingLiquidityEr";
import { buildAddLiquidityAndStakeEr, AddLiquidityAndStakeErArgs } from "./instructions/lp/addLiquidityAndStakeEr";
import { buildRemoveLiquidityEr, RemoveLiquidityErArgs } from "./instructions/lp/removeLiquidityEr";
import { buildCollectStakeRewardWithAction, CollectStakeRewardArgs } from "./instructions/lp/collectStakeRewardWithAction";
import { buildCompoundFeesWithAction, CompoundFeesArgs } from "./instructions/lp/compoundFeesWithAction";
import { buildMigrateStakeWithAction, MigrateStakeArgs } from "./instructions/lp/migrateStakeWithAction";
import { buildMigrateFlpWithAction, MigrateFlpArgs } from "./instructions/lp/migrateFlpWithAction";
import { buildMigrateFlpEr, MigrateFlpErArgs } from "./instructions/lp/migrateFlpEr";
import {
  buildRemoveLiquiditySettle,
  RemoveLiquiditySettleArgs,
} from "./instructions/lp/removeLiquidityClose";
import {
  buildAddCompoundingLiquiditySettle,
  AddCompoundingLiquidityCloseArgs,
} from "./instructions/lp/addCompoundingLiquidityClose";
import {
  buildRemoveCompoundingLiquiditySettle,
  RemoveCompoundingLiquidityCloseArgs,
} from "./instructions/lp/removeCompoundingLiquidityClose";
import {
  buildAddLiquidityAndStakeSettle,
  AddLiquidityAndStakeCloseArgs,
} from "./instructions/lp/addLiquidityAndStakeClose";
import {
  buildMigrateFlpSettle,
  MigrateFlpCloseArgs,
} from "./instructions/lp/migrateFlpClose";
import { buildMigrateStakeEr, MigrateStakeErArgs } from "./instructions/lp/migrateStakeEr";
import {
  buildMigrateStakeSettle,
  MigrateStakeCloseArgs,
} from "./instructions/lp/migrateStakeClose";

// Token-stake ER split-flow builders + their arg types.
import { buildDepositTokenStakeWithAction, DepositTokenStakeWithActionArgs } from "./instructions/stake/depositTokenStakeWithAction";
import { buildDepositTokenStakeEr, DepositTokenStakeErArgs } from "./instructions/stake/depositTokenStakeEr";
import { buildDepositTokenStakeSettle, DepositTokenStakeSettleArgs } from "./instructions/stake/depositTokenStakeSettle";
import { buildInitDelegateTokenStake, InitDelegateTokenStakeArgs } from "./instructions/stake/initDelegateTokenStake";
import { buildCollectRevenueWithAction, CollectRevenueWithActionArgs } from "./instructions/rebates/collectRevenueWithAction";
import { buildCollectRevenueEr, CollectRevenueErArgs } from "./instructions/rebates/collectRevenueEr";
import { buildCollectRevenueSettle, CollectRevenueSettleArgs } from "./instructions/rebates/collectRevenueSettle";
import { buildCollectTokenRewardWithAction, CollectTokenRewardWithActionArgs } from "./instructions/stake/collectTokenRewardWithAction";
import { buildCollectTokenRewardEr, CollectTokenRewardErArgs } from "./instructions/stake/collectTokenRewardEr";
import { buildCollectTokenRewardSettle, CollectTokenRewardSettleArgs } from "./instructions/stake/collectTokenRewardSettle";
import { buildWithdrawTokenWithAction, WithdrawTokenWithActionArgs } from "./instructions/stake/withdrawTokenWithAction";
import { buildWithdrawTokenEr, WithdrawTokenErArgs } from "./instructions/stake/withdrawTokenEr";
import { buildWithdrawTokenSettle, WithdrawTokenSettleArgs } from "./instructions/stake/withdrawTokenSettle";
import { buildCollectRebateWithAction, CollectRebateWithActionArgs } from "./instructions/rebates/collectRebateWithAction";
import { buildCollectRebateEr, CollectRebateErArgs } from "./instructions/rebates/collectRebateEr";
import { buildCollectRebateSettle, CollectRebateSettleArgs } from "./instructions/rebates/collectRebateSettle";

// =========================================================================
// Collateral overrides
// =========================================================================

/**
 * Per-target collateral overrides for LONG positions: `targetSymbol → collateral
 * symbol`. A long here locks the override token as collateral instead of the
 * symbol the caller passed.
 *
 * SOL longs use JitoSOL (a yield-bearing LST) as collateral rather than plain
 * SOL/WSOL — the on-chain "SOL Long" market is keyed on the JitoSOL custody, so
 * the market PDA, lock custody, and collateral custody must all resolve to
 * JitoSOL. Shorts and every other market are unaffected.
 */
const LONG_COLLATERAL_OVERRIDES: Record<string, string> = {
  SOL: "JitoSOL",
  WSOL: "JitoSOL",
};

// =========================================================================
// Types
// =========================================================================

export type FlashPerpetualsClientOptions = {
  postSendTxCallback?: (args: { txid: string }) => void;
  prioritizationFee?: number;
  txConfirmationCommitment?: Commitment;
  useExternalOracle?: boolean;
};

export type CreateSessionOptions = {
  /**
   * Set this when the caller generated a fresh session signer immediately
   * before calling createSession. In that path the session-token PDA cannot
   * already exist, so avoiding the RPC pre-check removes a flaky-RPC failure
   * point from the deposit critical path.
   */
  skipExistingSessionTokenCheck?: boolean;
};

export class FlashPerpetualsSetupVerificationError extends Error {
  constructor(
    public readonly accountName: string,
    public readonly address: PublicKey,
    public readonly cause: unknown,
  ) {
    super(
      `[FlashPerpetuals] Could not verify ${accountName} account ${address.toBase58()} before building setup instruction`,
    );
    this.name = "FlashPerpetualsSetupVerificationError";
  }
}

export class FlashPerpetualsAccountAlreadyInitializedError extends Error {
  constructor(
    public readonly accountName: string,
    public readonly address: PublicKey,
  ) {
    super(
      `[FlashPerpetuals] ${accountName} account ${address.toBase58()} already exists`,
    );
    this.name = "FlashPerpetualsAccountAlreadyInitializedError";
  }
}

const SETUP_ACCOUNT_CHECK_ATTEMPTS = 3;
const SETUP_ACCOUNT_CHECK_RETRY_DELAY_MS = 200;
const SETUP_ACCOUNT_CHECK_COMMITMENT: Commitment = "confirmed";

const emptyInstructionResult = (): InstructionResult => ({
  instructions: [],
  additionalSigners: [],
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Clone an IDL with the program id replaced in `idl.address` — Anchor's
 * `Program` reads the program id from there. Only rewritten when an explicit
 * override is supplied that differs from the baked-in address (typically a
 * non-mainnet cluster).
 */
function rewriteIdlAddress(idl: any, programId?: PublicKey): any {
  if (!programId || programId.toBase58() === idl.address) return idl;
  return { ...idl, address: programId.toBase58() };
}

// =========================================================================
// Client
// =========================================================================

/**
 * Parallel, faithful port of magic-trade's `MagicTradePerpetualsClient`,
 * adapted to client-v2's Flash perpetuals building blocks. Mirrors the
 * reference's section layout and method surface: setup/deposits, session-key
 * management, config-resolution helpers, positions, orders, delegation,
 * WithAction liquidity/staking, views, and transaction sending.
 *
 * Two connections:
 *   - `program`   : base layer (init/setup halves, delegation, WithAction).
 *   - `erProgram` : ER validator RPC (optional) — direct-ER positions/orders.
 */
export class FlashPerpetualsClient {
  public program: Program;
  public provider: AnchorProvider;
  public accounts: AccountFetcher;
  public viewHelper: ViewHelper;
  public erViewHelper: ViewHelper | null = null;
  public idl: any;
  /** On-chain view / quote functions (anchor `.view()`-style simulations). */
  public views: Views;

  // ER (Ephemeral Rollup) support
  public erProgram: Program | null = null;
  public erProvider: AnchorProvider | null = null;
  public erAccounts: AccountFetcher | null = null;

  // Session key trading: when set, the session signer goes in the `signer`
  // account and the session token PDA is passed to validate the session.
  private _sessionSigner: PublicKey | null = null;
  private _sessionToken: PublicKey | null = null;

  // Options
  public prioritizationFee: number;
  public useExternalOracle: boolean;
  private postSendTxCallback?: (args: { txid: string }) => void;
  private txConfirmationCommitment: Commitment;

  get programId(): PublicKey {
    return this.program.programId;
  }

  constructor(
    provider: AnchorProvider,
    idl: any = idlJson as any,
    /**
     * Override the program id baked into `idl.address`. Use this when the
     * program is deployed at a different address than the IDL was generated
     * for — typically a non-mainnet cluster. When omitted, `idl.address` is
     * used as-is.
     */
    programId?: PublicKey,
    opts: FlashPerpetualsClientOptions = {},
    erEndpoint?: string,
  ) {
    const effectiveIdl = rewriteIdlAddress(idl, programId);

    this.provider = provider;
    this.idl = effectiveIdl;
    this.program = new Program(effectiveIdl, provider);
    this.accounts = new AccountFetcher(this.program);
    this.viewHelper = new ViewHelper(
      provider.connection,
      this.program.programId,
      effectiveIdl,
    );
    // Prefer the ER helper when present (delegated pool/custody/market state
    // lives there); fall back to the base helper.
    this.views = new Views(
      this.program,
      () => this.erViewHelper ?? this.viewHelper,
    );

    this.prioritizationFee = opts.prioritizationFee ?? 0;
    this.useExternalOracle = opts.useExternalOracle ?? false;
    this.postSendTxCallback = opts.postSendTxCallback;
    this.txConfirmationCommitment = opts.txConfirmationCommitment ?? "processed";

    if (erEndpoint) {
      this.initEr(effectiveIdl, erEndpoint);
    }
  }

  private initEr(idl: any, erEndpoint: string) {
    const erConnection = new Connection(erEndpoint, "confirmed");
    this.erProvider = new AnchorProvider(erConnection, this.provider.wallet, {
      commitment: "confirmed",
    });
    this.erProgram = new Program(idl, this.erProvider);
    this.erAccounts = new AccountFetcher(this.erProgram);
    this.erViewHelper = new ViewHelper(
      erConnection,
      this.erProgram.programId,
      idl,
    );
  }

  get connection(): Connection {
    return this.provider.connection;
  }

  get erConnection(): Connection | null {
    return this.erProvider?.connection ?? null;
  }

  get wallet(): PublicKey {
    return this.provider.wallet.publicKey;
  }

  private getErProgram(): Program {
    if (!this.erProgram) {
      throw new Error("ER not initialized. Pass erEndpoint to constructor.");
    }
    return this.erProgram;
  }

  // =========================================================================
  // Config Resolution Helpers
  // =========================================================================

  /** Pick the ext or int oracle account for a custody, per `useExternalOracle`. */
  private oracleOf(custody: CustodyConfig): PublicKey {
    return this.useExternalOracle
      ? custody.extOracleAccount
      : custody.intOracleAccount;
  }

  /** Resolve a custody config from its token symbol (throws if missing). */
  private getCustodyConfigBySymbol(
    poolConfig: PoolConfig,
    symbol: string,
  ): CustodyConfig {
    const token = poolConfig.getTokenFromSymbol(symbol);
    const custody = token
      ? poolConfig.custodies.find((c) => c.mintKey.equals(token.mintKey))
      : undefined;
    if (!custody) throw new Error(`Custody not found for symbol: ${symbol}`);
    return custody;
  }

  /** Resolve target and lock custody configs from a market config. */
  private resolveCustodies(
    poolConfig: PoolConfig,
    marketConfig: MarketConfig,
  ): { targetCustodyConfig: CustodyConfig; lockCustodyConfig: CustodyConfig } {
    const targetCustodyConfig = poolConfig.custodies.find((c) =>
      c.custodyAccount.equals(marketConfig.targetCustody),
    );
    const lockCustodyConfig = poolConfig.custodies.find((c) =>
      c.custodyAccount.equals(marketConfig.collateralCustody),
    );
    if (!targetCustodyConfig)
      throw new Error(
        `Target custody not found for market ${marketConfig.marketAccount.toBase58()}`,
      );
    if (!lockCustodyConfig)
      throw new Error(
        `Lock custody not found for market ${marketConfig.marketAccount.toBase58()}`,
      );
    return { targetCustodyConfig, lockCustodyConfig };
  }

  /**
   * Resolve the effective collateral/lock symbol for a position, applying any
   * per-target LONG override (e.g. SOL longs lock JitoSOL). Shorts and targets
   * without an override pass through unchanged. Idempotent — passing an already
   * overridden symbol (e.g. "JitoSOL") returns it as-is.
   */
  public resolveCollateralSymbol(
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
  ): string {
    if (isVariant(side, "long")) {
      const override = LONG_COLLATERAL_OVERRIDES[targetSymbol];
      if (override) return override;
    }
    return collateralSymbol;
  }

  /**
   * Find a market config from target symbol, lock symbol, and side.
   *
   * NOTE: this resolves the market from the lock symbol AS PASSED — it does NOT
   * apply the LONG collateral override. That is deliberate: close / addCollateral /
   * decrease / removeCollateral all address an EXISTING position via its actual
   * collateral custody, so a legacy SOL-long opened against the WSOL-collateral
   * market must still resolve to that market. The override is applied only when
   * OPENING a new position (see `openPosition`, which pre-resolves the lock symbol
   * via `resolveCollateralSymbol`).
   */
  public findMarketConfig(
    poolConfig: PoolConfig,
    targetSymbol: string,
    lockSymbol: string,
    side: Side,
  ): MarketConfig {
    const targetCustody = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);
    const lockCustody = this.getCustodyConfigBySymbol(poolConfig, lockSymbol);
    const market = poolConfig.getMarketConfig(
      targetCustody.custodyAccount,
      lockCustody.custodyAccount,
      side,
    );
    if (!market)
      throw new Error(
        `Market not found for ${targetSymbol}/${lockSymbol} ${side}`,
      );
    return market;
  }

  private async getSetupAccountInfo(
    address: PublicKey,
    accountName: string,
  ): Promise<AccountInfo<Buffer> | null> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= SETUP_ACCOUNT_CHECK_ATTEMPTS; attempt++) {
      try {
        return await this.connection.getAccountInfo(
          address,
          SETUP_ACCOUNT_CHECK_COMMITMENT,
        );
      } catch (error) {
        lastError = error;
        if (attempt < SETUP_ACCOUNT_CHECK_ATTEMPTS) {
          await sleep(SETUP_ACCOUNT_CHECK_RETRY_DELAY_MS * attempt);
        }
      }
    }
    throw new FlashPerpetualsSetupVerificationError(
      accountName,
      address,
      lastError,
    );
  }

  setPrioritizationFee = (fee: number) => {
    this.prioritizationFee = fee;
  };

  // =========================================================================
  // SESSION KEY MANAGEMENT (runs on mainchain, via Session Keys program)
  // =========================================================================

  /**
   * Set a session key for trading. When set, the session signer is passed as
   * the `signer` account and the session token PDA is passed for validation.
   * The UI signs the transaction with the session key. Call with `null` to
   * clear and go back to owner-signed mode.
   */
  useSession = (sessionSigner: PublicKey | null) => {
    if (sessionSigner) {
      const [sessionToken] = findSessionTokenAddress(
        this.programId,
        sessionSigner,
        this.wallet,
      );
      this._sessionSigner = sessionSigner;
      this._sessionToken = sessionToken;
    } else {
      this._sessionSigner = null;
      this._sessionToken = null;
    }
  };

  /** The signer pubkey for trading instructions: session key if set, else owner. */
  private get tradingSigner(): PublicKey {
    return this._sessionSigner ?? this.wallet;
  }

  /** The session token PDA, or null if no session is active. */
  get sessionToken(): PublicKey | null {
    return this._sessionToken;
  }

  /**
   * Create a session token on mainchain. Both the owner wallet and session
   * keypair must sign this transaction. After confirmation, call `useSession()`
   * to activate the session for subsequent trades.
   */
  createSession = async (
    sessionSigner: PublicKey,
    topUp: boolean = false,
    validUntil?: BN,
    options: CreateSessionOptions = {},
  ): Promise<InstructionResult> => {
    const [sessionToken] = findSessionTokenAddress(
      this.programId,
      sessionSigner,
      this.wallet,
    );
    if (
      !options.skipExistingSessionTokenCheck &&
      (await this.getSetupAccountInfo(sessionToken, "sessionToken"))
    ) {
      throw new FlashPerpetualsAccountAlreadyInitializedError(
        "sessionToken",
        sessionToken,
      );
    }

    const ix = instructions.createSession(
      this.wallet,
      sessionSigner,
      this.programId,
      topUp,
      validUntil,
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  /** Revoke (close) a session token on mainchain. Returns rent to the authority. */
  revokeSession = async (
    sessionSigner: PublicKey,
  ): Promise<InstructionResult> => {
    const ix = instructions.revokeSession(
      this.wallet,
      sessionSigner,
      this.programId,
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  // =========================================================================
  // INITIALIZATION & DEPOSITS (runs on mainchain)
  // =========================================================================

  initializeBasket = async (): Promise<InstructionResult> => {
    const [basket] = findBasketAddress(this.wallet, this.programId);
    if (await this.getSetupAccountInfo(basket, "basket")) {
      return emptyInstructionResult();
    }

    const ix = await instructions.initializeBasket(this.program, this.wallet);
    return { instructions: [ix], additionalSigners: [] };
  };

  initializeUserDepositLedger = async (): Promise<InstructionResult> => {
    const [userDepositLedger] = findUserDepositLedgerAddress(
      this.wallet,
      this.programId,
    );
    if (await this.getSetupAccountInfo(userDepositLedger, "userDepositLedger")) {
      return emptyInstructionResult();
    }

    const ix = await instructions.initializeUserDepositLedger(
      this.program,
      this.wallet,
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  /** Admin-create the per-mint trade vault + token account (no-op if it already
   *  exists). Required before `depositDirect` for that mint. */
  initTradeVault = async (
    tokenMint: PublicKey,
    tokenProgramId: PublicKey = TOKEN_PROGRAM_ID,
  ): Promise<InstructionResult> => {
    const [tradeVault] = findTradeVaultAddress(tokenMint, this.programId);
    if (await this.getSetupAccountInfo(tradeVault, "tradeVault")) {
      return emptyInstructionResult();
    }

    const ix = await instructions.initTradeVault(
      this.program,
      tokenMint,
      this.wallet,
      tokenProgramId.equals(TOKEN_2022_PROGRAM_ID),
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  /**
   * Fund the caller's deposit ledger. Handles token-account setup the same way
   * the magic-trade client did:
   *  - SPL tokens: idempotent ATA creation + deposit.
   *  - Native SOL (NATIVE_MINT): create a temp WSOL account, deposit, close it.
   * `tokenProgramId` selects SPL vs Token-2022; `depositor` defaults to the wallet.
   */
  depositDirect = async (
    tokenMint: PublicKey,
    amount: BN,
    tokenProgramId: PublicKey = TOKEN_PROGRAM_ID,
    depositor: PublicKey = this.wallet,
  ): Promise<InstructionResult> => {
    const owner = this.wallet;
    const token22 = tokenProgramId.equals(TOKEN_2022_PROGRAM_ID);

    if (tokenMint.equals(NATIVE_MINT)) {
      // Native SOL: wrap into a throwaway WSOL account funded with amount + rent.
      const WSOL_RENT_EXEMPT_LAMPORTS = 2_039_280;
      const tempWsol = Keypair.generate();
      const createAccountIx = SystemProgram.createAccount({
        fromPubkey: depositor,
        newAccountPubkey: tempWsol.publicKey,
        lamports: amount.toNumber() + WSOL_RENT_EXEMPT_LAMPORTS,
        space: 165,
        programId: TOKEN_PROGRAM_ID,
      });
      const initIx = createInitializeAccount3Instruction(
        tempWsol.publicKey,
        NATIVE_MINT,
        depositor,
        TOKEN_PROGRAM_ID,
      );
      const depositIx = await instructions.depositDirect(
        this.program,
        owner,
        tokenMint,
        tempWsol.publicKey,
        amount,
        depositor,
        false,
      );
      const closeIx = createCloseAccountInstruction(
        tempWsol.publicKey,
        depositor,
        depositor,
        [],
        TOKEN_PROGRAM_ID,
      );
      return {
        instructions: [createAccountIx, initIx, depositIx, closeIx],
        additionalSigners: [tempWsol],
      };
    }

    const depositorTokenAccount = getAssociatedTokenAddressSync(
      tokenMint,
      depositor,
      true,
      tokenProgramId,
    );
    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      depositor,
      depositorTokenAccount,
      depositor,
      tokenMint,
      tokenProgramId,
    );
    const depositIx = await instructions.depositDirect(
      this.program,
      owner,
      tokenMint,
      depositorTokenAccount,
      amount,
      depositor,
      token22,
    );
    return { instructions: [createAtaIx, depositIx], additionalSigners: [] };
  };

  // =========================================================================
  // POSITION MANAGEMENT (runs on ER)
  // =========================================================================

  /**
   * Slippage-bounded oracle price for entry/exit, ported from the flash-sdk
   * `PerpetualsClient.getPriceAfterSlippage`. `slippageBps` is in BPS_DECIMALS
   * (1e4) units. Returns a ContractOraclePrice suitable for the trade params.
   */
  getPriceAfterSlippage(
    isEntry: boolean,
    slippageBps: BN,
    targetPrice: { price: BN; exponent: BN },
    side: Side,
  ): ContractOraclePrice {
    const exp = targetPrice.exponent.toNumber();
    const currentPrice = targetPrice.price;
    const spread = checkedDecimalCeilMul(
      currentPrice,
      targetPrice.exponent,
      slippageBps,
      new BN(-1 * BPS_DECIMALS),
      targetPrice.exponent,
    );
    if (isEntry) {
      if (isVariant(side, "long")) {
        return { price: currentPrice.add(spread), exponent: exp };
      }
      return spread.lt(currentPrice)
        ? { price: currentPrice.sub(spread), exponent: exp }
        : { price: BN_ZERO, exponent: exp };
    }
    // exit
    if (isVariant(side, "long")) {
      return spread.lt(currentPrice)
        ? { price: currentPrice.sub(spread), exponent: exp }
        : { price: BN_ZERO, exponent: exp };
    }
    return { price: currentPrice.add(spread), exponent: exp };
  }

  /**
   * Open a position.
   *
   * @param targetSymbol     The asset being traded.
   * @param lockSymbol       The market's lock custody (determines the market PDA).
   *                         For a SOL long this is overridden to JitoSOL.
   * @param collateralSymbol The token the user funds with (receiving custody). Left
   *                         as-is — if it differs from the lock custody the program
   *                         swaps it in (e.g. fund USDC → JitoSOL-collateral SOL long).
   * @param side             Long or Short.
   * @param priceWithSlippage Slippage-bounded oracle price for the entry.
   */
  openPosition = async (
    targetSymbol: string,
    lockSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    priceWithSlippage: ContractOraclePrice,
    collateralAmount: BN,
    sizeAmount: BN,
    privilege: Privilege = Privilege.None,
    referralAccount?: PublicKey,
    tokenStakeAccount?: PublicKey,
  ): Promise<InstructionResult> => {
    // Apply the per-target LONG collateral override (e.g. SOL long → JitoSOL) to
    // the LOCK custody only: it picks the market PDA and the locked collateral.
    // The funding/receiving token (`collateralSymbol`) is left untouched so the
    // caller can fund with anything (e.g. USDC) and let the program swap it into
    // the lock custody.
    const effectiveLockSymbol = this.resolveCollateralSymbol(
      targetSymbol,
      lockSymbol,
      side,
    );

    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);
    const lockCustodyConfig = this.getCustodyConfigBySymbol(
      poolConfig,
      effectiveLockSymbol,
    );
    const collateralCustodyConfig = this.getCustodyConfigBySymbol(
      poolConfig,
      collateralSymbol,
    );

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      effectiveLockSymbol,
      side,
    );

    const ix = await instructions.openPosition(
      this.getErProgram(),
      this.wallet,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      collateralCustodyConfig.custodyAccount,
      this.oracleOf(targetCustodyConfig),
      this.oracleOf(lockCustodyConfig),
      this.oracleOf(collateralCustodyConfig),
      priceWithSlippage,
      collateralAmount,
      sizeAmount,
      privilege,
      this.tradingSigner,
      this.sessionToken,
      referralAccount ?? PublicKey.default,
      tokenStakeAccount ?? PublicKey.default,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  closePosition = async (
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    priceWithSlippage: ContractOraclePrice,
    receivingSymbol?: string,
    privilege: Privilege = Privilege.None,
    referralAccount?: PublicKey,
    tokenStakeAccount?: PublicKey,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);

    // dispensingCustody: user's chosen receiving token, defaults to the
    // market's lock (collateral) custody.
    const dispensingCustodyConfig = receivingSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, receivingSymbol)
      : lockCustodyConfig;

    const ix = await instructions.closePosition(
      this.getErProgram(),
      this.wallet,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      dispensingCustodyConfig.custodyAccount,
      this.oracleOf(targetCustodyConfig),
      this.oracleOf(lockCustodyConfig),
      this.oracleOf(dispensingCustodyConfig),
      priceWithSlippage,
      privilege,
      this.tradingSigner,
      this.sessionToken,
      referralAccount ?? PublicKey.default,
      tokenStakeAccount ?? PublicKey.default,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  increasePositionSize = async (
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    priceWithSlippage: ContractOraclePrice,
    sizeDelta: BN,
    collateralAmount: BN,
    receivingSymbol?: string,
    privilege: Privilege = Privilege.None,
    referralAccount?: PublicKey,
    tokenStakeAccount?: PublicKey,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);

    // receivingCustody: the token the trader provides as added collateral,
    // defaults to the market's lock custody.
    const receivingCustodyConfig = receivingSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, receivingSymbol)
      : lockCustodyConfig;

    const ix = await instructions.increasePositionSize(
      this.getErProgram(),
      this.wallet,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      receivingCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      this.oracleOf(targetCustodyConfig),
      this.oracleOf(receivingCustodyConfig),
      this.oracleOf(lockCustodyConfig),
      priceWithSlippage,
      sizeDelta,
      collateralAmount,
      privilege,
      this.tradingSigner,
      this.sessionToken,
      referralAccount ?? PublicKey.default,
      tokenStakeAccount ?? PublicKey.default,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  decreasePositionSize = async (
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    priceWithSlippage: ContractOraclePrice,
    sizeDelta: BN,
    dispensingSymbol?: string,
    privilege: Privilege = Privilege.None,
    referralAccount?: PublicKey,
    tokenStakeAccount?: PublicKey,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);
    const dispensingCustodyConfig = dispensingSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, dispensingSymbol)
      : lockCustodyConfig;

    const ix = await instructions.decreasePositionSize(
      this.getErProgram(),
      this.wallet,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      dispensingCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      this.oracleOf(targetCustodyConfig),
      this.oracleOf(dispensingCustodyConfig),
      this.oracleOf(lockCustodyConfig),
      priceWithSlippage,
      sizeDelta,
      privilege,
      this.tradingSigner,
      this.sessionToken,
      referralAccount ?? PublicKey.default,
      tokenStakeAccount ?? PublicKey.default,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  addCollateral = async (
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    collateralDelta: BN,
    receivingSymbol?: string,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);
    const receivingCustodyConfig = receivingSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, receivingSymbol)
      : lockCustodyConfig;

    const ix = await instructions.addCollateral(
      this.getErProgram(),
      this.wallet,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      receivingCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      this.oracleOf(targetCustodyConfig),
      this.oracleOf(receivingCustodyConfig),
      this.oracleOf(lockCustodyConfig),
      collateralDelta,
      this.tradingSigner,
      this.sessionToken,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  removeCollateral = async (
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    collateralDeltaUsd: BN,
    dispensingSymbol?: string,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);
    const dispensingCustodyConfig = dispensingSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, dispensingSymbol)
      : lockCustodyConfig;

    const ix = await instructions.removeCollateral(
      this.getErProgram(),
      this.wallet,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      dispensingCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      this.oracleOf(targetCustodyConfig),
      this.oracleOf(dispensingCustodyConfig),
      this.oracleOf(lockCustodyConfig),
      collateralDeltaUsd,
      this.tradingSigner,
      this.sessionToken,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  liquidatePosition = async (
    positionOwner: PublicKey,
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);

    const ix = await instructions.liquidatePosition(
      this.getErProgram(),
      positionOwner,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      this.oracleOf(targetCustodyConfig),
      this.oracleOf(lockCustodyConfig),
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  forceClosePosition = async (
    positionOwner: PublicKey,
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    admin: PublicKey = this.wallet,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);

    const ix = await instructions.forceClosePosition(this.getErProgram(), {
      owner: positionOwner,
      pool: poolConfig.poolAddress,
      market: marketConfig.marketAccount,
      targetCustody: targetCustodyConfig.custodyAccount,
      lockCustody: lockCustodyConfig.custodyAccount,
      targetOracle: this.oracleOf(targetCustodyConfig),
      lockOracle: this.oracleOf(lockCustodyConfig),
      admin,
    });

    return { instructions: [ix], additionalSigners: [] };
  };

  // NOTE: no perpetuals equivalent — magic-trade's swapAndOpenPosition has no
  // client-v2 instruction builder; omitted.

  // =========================================================================
  // ORDER MANAGEMENT (runs on ER)
  // =========================================================================

  placeLimitOrder = async (
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    limitPrice: ContractOraclePrice,
    reserveAmount: BN,
    sizeAmount: BN,
    stopLossPrice: ContractOraclePrice,
    takeProfitPrice: ContractOraclePrice,
    receivingSymbol?: string,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);

    // reserve/receive custody: the token the trader provides as collateral,
    // defaults to the market's lock custody.
    const reserveCustodyConfig = receivingSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, receivingSymbol)
      : lockCustodyConfig;

    const ix = await instructions.placeLimitOrder(
      this.getErProgram(),
      this.wallet,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      reserveCustodyConfig.custodyAccount,
      reserveCustodyConfig.custodyAccount,
      this.oracleOf(targetCustodyConfig),
      this.oracleOf(reserveCustodyConfig),
      limitPrice,
      reserveAmount,
      sizeAmount,
      stopLossPrice,
      takeProfitPrice,
      this.tradingSigner,
      this.sessionToken,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  editLimitOrder = async (
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    orderId: number,
    limitPrice: ContractOraclePrice,
    sizeAmount: BN,
    stopLossPrice: ContractOraclePrice,
    takeProfitPrice: ContractOraclePrice,
    receivingSymbol?: string,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);

    // reserve/receive custody must match the order's reserve custody.
    const reserveCustodyConfig = receivingSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, receivingSymbol)
      : lockCustodyConfig;

    const ix = await instructions.editLimitOrder(
      this.getErProgram(),
      this.wallet,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      reserveCustodyConfig.custodyAccount,
      reserveCustodyConfig.custodyAccount,
      this.oracleOf(targetCustodyConfig),
      this.oracleOf(reserveCustodyConfig),
      orderId,
      limitPrice,
      sizeAmount,
      stopLossPrice,
      takeProfitPrice,
      this.tradingSigner,
      this.sessionToken,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  cancelLimitOrder = async (
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    orderId: number,
    receivingSymbol?: string,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);

    const reserveCustodyConfig = receivingSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, receivingSymbol)
      : lockCustodyConfig;

    const ix = await instructions.cancelLimitOrder(
      this.getErProgram(),
      this.wallet,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      reserveCustodyConfig.custodyAccount,
      orderId,
      this.tradingSigner,
      this.sessionToken,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  executeLimitOrder = async (
    owner: PublicKey,
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    orderId: number,
    receiveSymbol?: string,
    privilege: Privilege = Privilege.None,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);

    const reserveCustodyConfig = receiveSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, receiveSymbol)
      : lockCustodyConfig;

    const ix = await instructions.executeLimitOrder(
      this.getErProgram(),
      owner,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      reserveCustodyConfig.custodyAccount,
      this.oracleOf(targetCustodyConfig),
      this.oracleOf(reserveCustodyConfig),
      this.oracleOf(lockCustodyConfig),
      orderId,
      this.wallet,
      privilege,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  forceCloseOrder = async (
    owner: PublicKey,
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    reserveSymbol?: string,
    admin: PublicKey = this.wallet,
    additionalReserveCustodies?: PublicKey[],
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);
    const reserveCustodyConfig = reserveSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, reserveSymbol)
      : lockCustodyConfig;
    const remainingReserveCustodies =
      additionalReserveCustodies ??
      poolConfig.custodies
        .map((custody) => custody.custodyAccount)
        .filter((custody) => !custody.equals(reserveCustodyConfig.custodyAccount));

    const ix = await instructions.forceCloseOrder(this.getErProgram(), {
      owner,
      pool: poolConfig.poolAddress,
      market: marketConfig.marketAccount,
      targetCustody: targetCustodyConfig.custodyAccount,
      lockCustody: lockCustodyConfig.custodyAccount,
      reserveCustody: reserveCustodyConfig.custodyAccount,
      admin,
      additionalReserveCustodies: remainingReserveCustodies,
    });

    return { instructions: [ix], additionalSigners: [] };
  };

  placeTriggerOrder = async (
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    triggerPrice: ContractOraclePrice,
    deltaSizeAmount: BN,
    isStopLoss: boolean,
    receiveSymbol?: string,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);

    const receiveCustodyConfig = receiveSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, receiveSymbol)
      : lockCustodyConfig;

    const ix = await instructions.placeTriggerOrder(
      this.getErProgram(),
      this.wallet,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      receiveCustodyConfig.custodyAccount,
      this.oracleOf(targetCustodyConfig),
      this.oracleOf(lockCustodyConfig),
      triggerPrice,
      deltaSizeAmount,
      isStopLoss,
      this.tradingSigner,
      this.sessionToken,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  editTriggerOrder = async (
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    orderId: number,
    triggerPrice: ContractOraclePrice,
    deltaSizeAmount: BN,
    isStopLoss: boolean,
    receiveSymbol?: string,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);

    const receiveCustodyConfig = receiveSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, receiveSymbol)
      : lockCustodyConfig;

    const ix = await instructions.editTriggerOrder(
      this.getErProgram(),
      this.wallet,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      receiveCustodyConfig.custodyAccount,
      this.oracleOf(targetCustodyConfig),
      this.oracleOf(lockCustodyConfig),
      orderId,
      triggerPrice,
      deltaSizeAmount,
      isStopLoss,
      this.tradingSigner,
      this.sessionToken,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  cancelTriggerOrder = async (
    market: PublicKey,
    orderId: number,
    isStopLoss: boolean,
  ): Promise<InstructionResult> => {
    const ix = await instructions.cancelTriggerOrder(
      this.getErProgram(),
      this.wallet,
      market,
      orderId,
      isStopLoss,
      this.tradingSigner,
      this.sessionToken,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  cancelAllTriggerOrders = async (
    market: PublicKey,
  ): Promise<InstructionResult> => {
    const ix = await instructions.cancelAllTriggerOrders(
      this.getErProgram(),
      this.wallet,
      market,
      this.tradingSigner,
      this.sessionToken,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  executeTriggerOrder = async (
    owner: PublicKey,
    targetSymbol: string,
    collateralSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    orderId: number,
    isStopLoss: boolean,
    dispensingSymbol?: string,
    privilege: Privilege = Privilege.None,
  ): Promise<InstructionResult> => {
    const targetCustodyConfig = this.getCustodyConfigBySymbol(poolConfig, targetSymbol);

    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      collateralSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);

    const dispensingCustodyConfig = dispensingSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, dispensingSymbol)
      : lockCustodyConfig;

    const ix = await instructions.executeTriggerOrder(
      this.getErProgram(),
      owner,
      poolConfig.poolAddress,
      marketConfig.marketAccount,
      targetCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      dispensingCustodyConfig.custodyAccount,
      this.oracleOf(targetCustodyConfig),
      this.oracleOf(lockCustodyConfig),
      this.oracleOf(dispensingCustodyConfig),
      orderId,
      isStopLoss,
      this.wallet,
      privilege,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  // =========================================================================
  // LEGACY TRADE MIGRATION / CLEANUP
  // =========================================================================

  migratePositionToBasket = async (
    owner: PublicKey,
    targetSymbol: string,
    lockSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
  ): Promise<InstructionResult> => {
    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      lockSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);

    const ix = await instructions.migratePositionToBasket(
      this.getErProgram(),
      this.wallet,
      owner,
      marketConfig.marketAccount,
      lockCustodyConfig.custodyAccount,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  migrateOrderToBasket = async (
    owner: PublicKey,
    targetSymbol: string,
    lockSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    reserveSymbol?: string,
    additionalReserveSymbols: string[] = [],
  ): Promise<InstructionResult> => {
    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      lockSymbol,
      side,
    );
    const { lockCustodyConfig } = this.resolveCustodies(poolConfig, marketConfig);
    const reserveCustodyConfig = reserveSymbol
      ? this.getCustodyConfigBySymbol(poolConfig, reserveSymbol)
      : lockCustodyConfig;
    const additionalReserveCustodies = additionalReserveSymbols.map(
      (symbol) => this.getCustodyConfigBySymbol(poolConfig, symbol).custodyAccount,
    );

    const ix = await instructions.migrateOrderToBasket(
      this.getErProgram(),
      this.wallet,
      owner,
      marketConfig.marketAccount,
      lockCustodyConfig.custodyAccount,
      reserveCustodyConfig.custodyAccount,
      additionalReserveCustodies,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  closeLegacyPositionAccount = async (
    owner: PublicKey,
    targetSymbol: string,
    lockSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    admin: PublicKey = this.wallet,
  ): Promise<InstructionResult> => {
    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      lockSymbol,
      side,
    );

    const ix = await instructions.closeLegacyPositionAccount(
      this.program,
      owner,
      marketConfig.marketAccount,
      admin,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  closeLegacyOrderAccount = async (
    owner: PublicKey,
    targetSymbol: string,
    lockSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
    admin: PublicKey = this.wallet,
  ): Promise<InstructionResult> => {
    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      lockSymbol,
      side,
    );

    const ix = await instructions.closeLegacyOrderAccount(
      this.program,
      owner,
      marketConfig.marketAccount,
      admin,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  // =========================================================================
  // INTERNAL ORACLE / PRICE PUSHER (runs on ER)
  // =========================================================================

  /**
   * Build a single `set_internal_lazer_price_er` instruction that updates the
   * internal oracle accounts for many tokens at once. `tokenMintList` is
   * resolved to each custody's `intOracleAccount` (looked up across every pool
   * in `poolConfigs`) and passed as the writable remaining-account tail. The
   * resulting instruction is an ER op — send it via `sendErTransaction`.
   *
   * Mirrors magic-trade-client's `setInternalLazerPriceBatch` so the price
   * pusher bot can pack a Lazer message + its mints into one ER tx.
   */
  setInternalLazerPriceBatch = async (
    messageData: Buffer,
    tokenMintList: PublicKey[],
    pythStorage: PublicKey,
    poolConfigs: PoolConfig[],
  ): Promise<InstructionResult> => {
    const allCustodyConfigs: CustodyConfig[] = poolConfigs
      .map((p) => p.custodies)
      .flat();

    const intOracleAccounts: PublicKey[] = tokenMintList.map((tokenMint) => {
      const custody = allCustodyConfigs.find((c) => c.mintKey.equals(tokenMint));
      if (!custody) {
        throw new Error(`Custody not found for mint ${tokenMint.toBase58()}`);
      }
      return custody.intOracleAccount;
    });

    const ix = await instructions.setInternalLazerPriceEr(
      this.getErProgram(),
      this.wallet,
      pythStorage,
      messageData,
      intOracleAccounts,
    );

    return { instructions: [ix], additionalSigners: [] };
  };

  // =========================================================================
  // ER DELEGATION (Basechain -> ER)
  // =========================================================================

  delegatePool = async (
    poolConfig: PoolConfig,
  ): Promise<InstructionResult> => {
    const ix = await instructions.delegatePool(
      this.program,
      poolConfig.poolName,
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  delegateCustody = async (
    custodySymbol: string,
    poolConfig: PoolConfig,
  ): Promise<InstructionResult> => {
    const custodyConfig = this.getCustodyConfigBySymbol(poolConfig, custodySymbol);

    const ix = await instructions.delegateCustody(
      this.program,
      poolConfig.poolName,
      custodyConfig.mintKey,
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  delegateMarket = async (
    targetSymbol: string,
    lockSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
  ): Promise<InstructionResult> => {
    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      lockSymbol,
      side,
    );
    const { targetCustodyConfig, lockCustodyConfig } = this.resolveCustodies(
      poolConfig,
      marketConfig,
    );

    const ix = await instructions.delegateMarket(
      this.program,
      targetCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      side,
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  delegateBasket = async (
    owner: PublicKey,
  ): Promise<InstructionResult> => {
    const [basket] = findBasketAddress(owner, this.programId);
    const basketInfo = await this.getSetupAccountInfo(basket, "basket");
    if (basketInfo?.owner.equals(DELEGATION_PROGRAM_ID)) {
      return emptyInstructionResult();
    }

    const ix = await instructions.delegateBasket(
      this.program,
      owner,
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  delegateReallocVault = async (
  ): Promise<InstructionResult> => {
    const ix = await instructions.delegateReallocVault(
      this.program,
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  // =========================================================================
  // ER UNDELEGATION (ER -> Basechain)
  // =========================================================================

  undelegatePool = async (
    poolConfig: PoolConfig,
  ): Promise<InstructionResult> => {
    const ix = await instructions.undelegatePool(this.program, poolConfig.poolName);
    return { instructions: [ix], additionalSigners: [] };
  };

  /** undelegate_basket — bring a single owner's basket back to base (admin-gated). */
  undelegateBasket = async (
    owner: PublicKey,
    admin?: PublicKey,
  ): Promise<InstructionResult> => {
    const ix = await instructions.undelegateBasket(this.program, owner, admin);
    return { instructions: [ix], additionalSigners: [] };
  };

  /** undelegate_token_stake — bring a single owner's token_stake back to base (admin-gated). */
  undelegateTokenStake = async (
    owner: PublicKey,
    admin?: PublicKey,
  ): Promise<InstructionResult> => {
    const ix = await instructions.undelegateTokenStake(this.program, owner, admin);
    return { instructions: [ix], additionalSigners: [] };
  };

  undelegateCustody = async (
    custodySymbol: string,
    poolConfig: PoolConfig,
  ): Promise<InstructionResult> => {
    const custodyConfig = this.getCustodyConfigBySymbol(poolConfig, custodySymbol);
    const ix = await instructions.undelegateCustody(
      this.program,
      poolConfig.poolName,
      custodyConfig.mintKey,
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  undelegateMarket = async (
    targetSymbol: string,
    lockSymbol: string,
    side: Side,
    poolConfig: PoolConfig,
  ): Promise<InstructionResult> => {
    const marketConfig = this.findMarketConfig(
      poolConfig,
      targetSymbol,
      lockSymbol,
      side,
    );
    const { targetCustodyConfig, lockCustodyConfig } = this.resolveCustodies(
      poolConfig,
      marketConfig,
    );
    const ix = await instructions.undelegateMarket(
      this.program,
      targetCustodyConfig.custodyAccount,
      lockCustodyConfig.custodyAccount,
      side,
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  undelegateReallocVault = async (): Promise<InstructionResult> => {
    const ix = await instructions.undelegateReallocVault(this.program);
    return { instructions: [ix], additionalSigners: [] };
  };

  // =========================================================================
  // WITHDRAWAL / SETTLEMENT (base layer; validator-orchestrated)
  // =========================================================================

  /** `feePayer` must differ from the owner wallet: the delegation program's
   *  post-delegation-action signer validation rejects the merged account meta
   *  when owner == fee_payer. It pays the escrow rent and must co-sign. */
  withdrawalWithAction = async (
    tokenMint: PublicKey,
    ownerTokenAccount: PublicKey,
    amount: BN,
    feePayer: PublicKey,
    token22 = false,
  ): Promise<InstructionResult> => {
    if (feePayer.equals(this.wallet)) {
      throw new Error(
        "withdrawalWithAction: feePayer must differ from the owner wallet",
      );
    }
    const ix = await instructions.withdrawalWithAction(
      this.program,
      this.wallet,
      tokenMint,
      ownerTokenAccount,
      amount,
      feePayer,
      token22,
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  custodySettlementWithAction = async (
    custodySymbol: string,
    poolConfig: PoolConfig,
    token22 = false,
  ): Promise<InstructionResult> => {
    const custodyConfig = this.getCustodyConfigBySymbol(poolConfig, custodySymbol);
    const ix = await instructions.custodySettlementWithAction(
      this.program,
      poolConfig.poolAddress,
      custodyConfig.custodyAccount,
      custodyConfig.mintKey,
      this.wallet,
      token22,
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  withdrawalSettle = async (
    tokenMint: PublicKey,
    poolConfig: PoolConfig,
    custodySettlementSettle?: boolean,
  ): Promise<InstructionResult> => {
    const withdrawToken = poolConfig.getTokenFromMintPk?.(tokenMint);
    const token22 = !!withdrawToken?.isToken2022;
    const tokenProgramId = token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const ownerTokenAccount = getAssociatedTokenAddressSync(
      tokenMint,
      this.wallet,
      true,
      tokenProgramId,
    );

    const instructionsToSend: TransactionInstruction[] = [
      createAssociatedTokenAccountIdempotentInstruction(
        this.wallet,
        ownerTokenAccount,
        this.wallet,
        tokenMint,
        tokenProgramId,
      ),
    ];

    const custodyConfig = poolConfig.custodies.find((custody) =>
      custody.mintKey.equals(tokenMint),
    );
    if (!custodyConfig) {
      throw new Error(`Custody not found for mint: ${tokenMint.toBase58()}`);
    }

    let shouldExecuteCustodySettlement = custodySettlementSettle ?? false;
    if (custodySettlementSettle === undefined) {
      const [settlementReceipt] = findCustodySettlementReceiptAddress(
        custodyConfig.custodyAccount,
        this.program.programId,
      );
      const settlementReceiptInfo = await this.connection
        .getAccountInfo(settlementReceipt)
        .catch(() => null);
      shouldExecuteCustodySettlement =
        settlementReceiptInfo !== null &&
        settlementReceiptInfo.lamports > 0 &&
        settlementReceiptInfo.owner.equals(this.program.programId);
    }

    if (shouldExecuteCustodySettlement) {
      instructionsToSend.push(
        await instructions.custodySettlementSettle(
          this.program,
          this.wallet,
          poolConfig.poolAddress,
          custodyConfig.custodyAccount,
          custodyConfig.mintKey,
          token22,
        ),
      );
    }

    instructionsToSend.push(
      await instructions.withdrawalSettle(
        this.program,
        this.wallet,
        ownerTokenAccount,
        tokenMint,
        token22,
      ),
    );

    return { instructions: instructionsToSend, additionalSigners: [] };
  };

  // =========================================================================
  // LIQUIDITY / STAKING — WithAction flows (base layer; validator-orchestrated)
  //
  // Each sends ONE base-layer `*WithAction` tx, then `awaitOutcome(...)` on
  // the receipt — the validator runs `_er → _settle` automatically.
  // =========================================================================

  swapWithAction = (poolConfig: PoolConfig, args: SwapWithActionArgs) =>
    buildSwapWithAction(this.program, poolConfig, {
      useExtOracle: this.useExternalOracle,
      ...args,
    });

  addLiquidityAndStakeWithAction = (
    poolConfig: PoolConfig,
    args: AddLiquidityAndStakeArgs,
  ) =>
    buildAddLiquidityAndStakeWithAction(this.program, poolConfig, {
      useExtOracle: this.useExternalOracle,
      ...args,
    });

  removeLiquidityWithAction = (
    poolConfig: PoolConfig,
    args: RemoveLiquidityArgs,
  ) =>
    buildRemoveLiquidityWithAction(this.program, poolConfig, {
      useExtOracle: this.useExternalOracle,
      ...args,
    });

  addCompoundingLiquidityWithAction = (
    poolConfig: PoolConfig,
    args: AddCompoundingLiquidityArgs,
  ) =>
    buildAddCompoundingLiquidityWithAction(this.program, poolConfig, {
      useExtOracle: this.useExternalOracle,
      ...args,
    });

  removeCompoundingLiquidityWithAction = (
    poolConfig: PoolConfig,
    args: RemoveCompoundingLiquidityArgs,
  ) =>
    buildRemoveCompoundingLiquidityWithAction(
      this.program,
      poolConfig,
      { useExtOracle: this.useExternalOracle, ...args },
    );

  // --- Direct-ER compounding liquidity commit steps -------------------------
  // Sent to the ER (via sendErTransaction). Use these to drive the `_er` step
  // client-side instead of relying on a keeper / queued post-delegation action
  // (i.e. addCompoundingLiquidityWithAction with queueErAction:false).

  /** add_compounding_liquidity_er — ER-side commit of a compounding deposit.
   *  Runs on the ER program; defaults oracle selection to the external oracle. */
  addCompoundingLiquidityEr = (
    poolConfig: PoolConfig,
    args: AddCompoundingLiquidityErArgs,
  ) => buildAddCompoundingLiquidityEr(this.getErProgram(), poolConfig, args);

  /** remove_compounding_liquidity_er — ER-side commit of a compounding withdraw. */
  removeCompoundingLiquidityEr = (
    poolConfig: PoolConfig,
    args: RemoveCompoundingLiquidityErArgs,
  ) => buildRemoveCompoundingLiquidityEr(this.getErProgram(), poolConfig, args);

  /** add_liquidity_and_stake_er — ER-side commit of a staked-LP deposit.
   *  Drive this client-side after `addLiquidityAndStakeWithAction` with
   *  `queueErAction:false`, instead of relying on a keeper. */
  addLiquidityAndStakeEr = (
    poolConfig: PoolConfig,
    args: AddLiquidityAndStakeErArgs,
  ) => buildAddLiquidityAndStakeEr(this.getErProgram(), poolConfig, args);

  /** remove_liquidity_er — ER-side commit of a staked-LP withdraw. */
  removeLiquidityEr = (
    poolConfig: PoolConfig,
    args: RemoveLiquidityErArgs,
  ) => buildRemoveLiquidityEr(this.getErProgram(), poolConfig, args);

  collectStakeRewardWithAction = (
    poolConfig: PoolConfig,
    args: CollectStakeRewardArgs,
  ) => buildCollectStakeRewardWithAction(this.program, poolConfig, args);

  compoundFeesWithAction = (poolConfig: PoolConfig, args: CompoundFeesArgs = {}) =>
    buildCompoundFeesWithAction(this.program, poolConfig, {
      useExtOracle: this.useExternalOracle,
      ...args,
    });

  migrateStakeWithAction = (poolConfig: PoolConfig, args: MigrateStakeArgs) =>
    buildMigrateStakeWithAction(this.program, poolConfig, {
      useExtOracle: this.useExternalOracle,
      ...args,
    });

  migrateFlpWithAction = (poolConfig: PoolConfig, args: MigrateFlpArgs) =>
    buildMigrateFlpWithAction(this.program, poolConfig, {
      useExtOracle: this.useExternalOracle,
      ...args,
    });

  /** migrate_flp_er — ER-side commit of the migrate-flp flow (sFLP → staked LP).
   *  Drive this client-side after `migrateFlpWithAction` with `queueErAction:false`,
   *  instead of relying on a keeper. On a slippage fail the queued settle remints
   *  the upfront-burnt sFLP back to the user. */
  migrateFlpEr = (poolConfig: PoolConfig, args: MigrateFlpErArgs) =>
    buildMigrateFlpEr(this.getErProgram(), poolConfig, args);

  /** remove_liquidity_settle — base-layer terminal close for both withdraw outcomes. */
  removeLiquiditySettle = (
    poolConfig: PoolConfig,
    args: RemoveLiquiditySettleArgs,
  ) => buildRemoveLiquiditySettle(this.program, poolConfig, args);

  // --- terminal base-layer close actions for the other LP / migrate flows ---
  // Recover a receipt left processed-but-open if the ER-queued settle did not run.
  // The settle handlers branch internally by the receipt's decision field.

  /** add_compounding_liquidity_settle — closes success and refund branches. */
  addCompoundingLiquiditySettle = (poolConfig: PoolConfig, args: AddCompoundingLiquidityCloseArgs) =>
    buildAddCompoundingLiquiditySettle(this.program, poolConfig, args);

  /** remove_compounding_liquidity_settle — closes success and re-mint branches. */
  removeCompoundingLiquiditySettle = (poolConfig: PoolConfig, args: RemoveCompoundingLiquidityCloseArgs) =>
    buildRemoveCompoundingLiquiditySettle(this.program, poolConfig, args);

  /** add_liquidity_and_stake_settle — closes success and refund branches. */
  addLiquidityAndStakeSettle = (poolConfig: PoolConfig, args: AddLiquidityAndStakeCloseArgs) =>
    buildAddLiquidityAndStakeSettle(this.program, poolConfig, args);

  /** migrate_flp_settle — closes success and sFLP re-mint branches. */
  migrateFlpSettle = (poolConfig: PoolConfig, args: MigrateFlpCloseArgs = {}) =>
    buildMigrateFlpSettle(this.program, poolConfig, args);

  // --- migrate_stake (staked FLP → sFLP) ER commit + terminal close ---

  /** migrate_stake_er — ER-side commit of the migrate_stake_with_action flow.
   *  Drive client-side after `migrateStakeWithAction` with `queueErAction:false`.
   *  Forwards the AUM account set (recomputed when the pool is stale). */
  migrateStakeEr = (poolConfig: PoolConfig, args: MigrateStakeErArgs) =>
    buildMigrateStakeEr(this.getErProgram(), poolConfig, args);
  /** migrate_stake_settle — closes success and reward-only branches. */
  migrateStakeSettle = (poolConfig: PoolConfig, args: MigrateStakeCloseArgs = {}) =>
    buildMigrateStakeSettle(this.program, poolConfig, args);

  /**
   * refresh_stake_er — promote the owner's `pending_activation` → `active_amount`
   * (and `pending_deactivation` → `deactivated_amount`) on the ER. Newly minted /
   * migrated-in sFLP lands in `pending_activation` and is NOT usable until
   * refreshed: `migrate_stake_er` (sFLP→FLP) requires `active_amount`, so without
   * this the conversion reverts. (Unstake / collect-reward already refresh inline,
   * so they don't need this.) Direct-ER `#[commit]` ix — sign with a throwaway
   * `payer`; the delegated `flp_stake` is mutated and committed (not undelegated).
   */
  refreshStakeEr = async (
    poolConfig: PoolConfig,
    args: { payer: PublicKey; owner?: PublicKey; rewardSymbol?: string },
  ): Promise<InstructionResult> => {
    const program = this.getErProgram();
    const owner = args.owner ?? this.wallet;
    const pool = poolConfig.poolAddress;
    const rewardC = poolConfig.custodies.find((c) =>
      c.mintKey.equals(
        poolConfig.getTokenFromSymbol(args.rewardSymbol ?? "USDC").mintKey,
      ),
    )!;
    const flpStake = findFlpStakeAddress(owner, pool, program.programId)[0];
    const tokenStake = findTokenStakeAddress(owner, program.programId)[0];
    const ix = await instructions.refreshStakeEr(
      program,
      poolConfig.poolName,
      rewardC.custodyAccount,
      [{ flpStake, tokenStake }],
      args.payer,
    );
    return { instructions: [ix], additionalSigners: [] };
  };

  // =========================================================================
  // TOKEN-STAKE (FAF) — ER split flows
  //
  // Base-layer `*WithAction` delegates the receipt(s); a keeper (or the
  // matching `*Er` method, driven client-side) commits on the ER, then
  // `*Settle` finalises on the base chain. `_er` methods run on the ER program.
  // =========================================================================

  // --- deposit ---

  /** deposit_token_stake_with_action — delegate token_stake + deposit receipt. */
  depositTokenStakeWithAction = (args: DepositTokenStakeWithActionArgs) =>
    buildDepositTokenStakeWithAction(this.program, args);

  /** init_delegate_token_stake — create + delegate a token_stake (no token
   *  movement, non-signing owner; `payer` signs). */
  initDelegateTokenStake = (args: InitDelegateTokenStakeArgs) =>
    buildInitDelegateTokenStake(this.program, args);

  /** deposit_token_stake_er — ER-side commit of a token-stake deposit. */
  depositTokenStakeEr = (args: DepositTokenStakeErArgs) =>
    buildDepositTokenStakeEr(this.getErProgram(), args);

  /** deposit_token_stake_settle — base-chain settle of a token-stake deposit. */
  depositTokenStakeSettle = (args: DepositTokenStakeSettleArgs) =>
    buildDepositTokenStakeSettle(this.program, args);

  // --- unstake (direct-ER) ---

  /** unstake_token_request_er — begin an unlock on the ER. */
  unstakeTokenRequestEr = (unstakeAmount: BN, owner?: PublicKey) =>
    instructions.unstakeTokenRequestEr(this.getErProgram(), unstakeAmount, owner);

  /** cancel_unstake_token_request_er — cancel a pending unlock on the ER. */
  cancelUnstakeTokenRequestEr = (withdrawRequestId: number, owner?: PublicKey) =>
    instructions.cancelUnstakeTokenRequestEr(this.getErProgram(), withdrawRequestId, owner);

  // --- collect revenue ---

  /** collect_revenue_with_action — delegate the collect_revenue receipt. */
  collectRevenueWithAction = (args: CollectRevenueWithActionArgs) =>
    buildCollectRevenueWithAction(this.program, args);

  /** collect_revenue_er — ER-side commit of a revenue claim. */
  collectRevenueEr = (args: CollectRevenueErArgs) =>
    buildCollectRevenueEr(this.getErProgram(), args);

  /** collect_revenue_settle — base-chain settle of a revenue claim. */
  collectRevenueSettle = (args: CollectRevenueSettleArgs) =>
    buildCollectRevenueSettle(this.program, args);

  // --- collect token reward ---

  /** collect_token_reward_with_action — delegate the reward receipt. */
  collectTokenRewardWithAction = (args: CollectTokenRewardWithActionArgs) =>
    buildCollectTokenRewardWithAction(this.program, args);

  /** collect_token_reward_er — ER-side commit of a reward claim. */
  collectTokenRewardEr = (args: CollectTokenRewardErArgs) =>
    buildCollectTokenRewardEr(this.getErProgram(), args);

  /** collect_token_reward_settle — base-chain settle of a reward claim. */
  collectTokenRewardSettle = (args: CollectTokenRewardSettleArgs) =>
    buildCollectTokenRewardSettle(this.program, args);

  // --- withdraw token (matured-unstake, ER bridge) ---

  /** withdraw_token_with_action — delegate the withdraw receipt for a matured unstake. */
  withdrawTokenWithAction = (args: WithdrawTokenWithActionArgs) =>
    buildWithdrawTokenWithAction(this.program, args);

  /** withdraw_token_er — ER-side commit of a matured-unstake withdrawal. */
  withdrawTokenEr = (args: WithdrawTokenErArgs) =>
    buildWithdrawTokenEr(this.getErProgram(), args);

  /** withdraw_token_settle — base-chain settle of a matured-unstake withdrawal. */
  withdrawTokenSettle = (args: WithdrawTokenSettleArgs) =>
    buildWithdrawTokenSettle(this.program, args);

  // --- collect rebate ---

  /** collect_rebate_with_action — delegate the collect_rebate receipt. */
  collectRebateWithAction = (args: CollectRebateWithActionArgs) =>
    buildCollectRebateWithAction(this.program, args);

  /** collect_rebate_er — ER-side commit of a rebate claim. */
  collectRebateEr = (args: CollectRebateErArgs) =>
    buildCollectRebateEr(this.getErProgram(), args);

  /** collect_rebate_settle — base-chain settle of a rebate claim. */
  collectRebateSettle = (args: CollectRebateSettleArgs) =>
    buildCollectRebateSettle(this.program, args);

  // --- withdraw (base) ---

  /** withdraw_token — withdraw a vested token-stake unstake request. */
  withdrawToken = (
    tokenMint: PublicKey,
    receivingTokenAccount: PublicKey,
    withdrawRequestId: number,
    opts: { owner?: PublicKey; token22?: boolean } = {},
  ): Promise<InstructionResult> =>
    instructions
      .withdrawToken(this.program, tokenMint, receivingTokenAccount, withdrawRequestId, opts)
      .then((ix) => ({ instructions: [ix], additionalSigners: [] }));

  // =========================================================================
  // RECEIPT OUTCOME HELPERS
  // =========================================================================

  /** Wait for a validator-driven user flow to close after settle. */
  awaitOutcome = (
    accountName: Parameters<typeof awaitReceiptOutcome>[1],
    receipt: PublicKey,
    opts?: { timeoutMs?: number; intervalMs?: number },
  ): Promise<ReceiptOutcome> =>
    awaitReceiptOutcome(this.program, accountName, receipt, opts);

  /** Wait for a withdrawal / custody-settlement escrow PDA to be closed. */
  awaitClosed = (
    pda: PublicKey,
    opts?: { timeoutMs?: number; intervalMs?: number },
  ) => awaitClosed(this.connection, pda, opts);

  // =========================================================================
  // TRANSACTION HELPERS
  // =========================================================================

  async sendTransaction(
    ixs: TransactionInstruction[],
    opts: SendTransactionOpts = {},
  ): Promise<string> {
    return sendBaseTransaction(this.provider, ixs, {
      postSendTxCallback: this.postSendTxCallback,
      prioritizationFee: this.prioritizationFee,
      ...opts,
    });
  }

  async sendAndConfirmTransaction(
    ixs: TransactionInstruction[],
    opts: SendTransactionOpts = {},
  ): Promise<string> {
    const signature = await this.sendTransaction(ixs, opts);
    return confirmBaseTransaction(
      this.provider,
      signature,
      undefined,
      this.txConfirmationCommitment,
    );
  }

  /**
   * Send a legacy transaction to the MagicBlock ER, signed with the supplied
   * Keypair(s). `signers[0]` is the fee payer. Returns just the signature
   * (use `sendAndConfirmErTransaction` for the status object).
   */
  async sendErTransaction(
    ixs: TransactionInstruction[],
    signers: Keypair[],
    opts: SendErOpts = {},
  ): Promise<string> {
    if (!this.erConnection) {
      throw new Error("ER not initialized. Pass erEndpoint to constructor.");
    }
    const { signature } = await sendErTransactionLegacy(
      this.erConnection,
      ixs,
      signers,
      {
        postSendTxCallback: this.postSendTxCallback,
        ...opts,
        skipConfirm: true,
      },
    );
    return signature;
  }

  /** Send + poll until the ER returns a confirmed status. Returns `{ signature, status }`. */
  async sendAndConfirmErTransaction(
    ixs: TransactionInstruction[],
    signers: Keypair[],
    opts: SendErOpts = {},
  ): Promise<SendErResult> {
    if (!this.erConnection) {
      throw new Error("ER not initialized. Pass erEndpoint to constructor.");
    }
    return sendErTransactionLegacy(this.erConnection, ixs, signers, {
      postSendTxCallback: this.postSendTxCallback,
      ...opts,
    });
  }
}
