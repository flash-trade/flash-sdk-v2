import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Perpetuals } from "../../idl/perpetuals";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { buildAumRemainingAccounts } from "../../utils/remainingAccounts";
import { delegatedAccountFragment, sharedDelegationAccounts } from "../../utils/delegation";
import {
  findCompDepositReceiptAddress,
  findWhitelistAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface AddCompoundingLiquidityArgs {
  inSymbol: string;
  fundingAccount: PublicKey; // user ATA of deposited token
  compoundingTokenAccount: PublicKey; // user ATA of the compounding (sFLP) mint
  amountIn: BN;
  minCompoundingAmountOut: BN;
  owner?: PublicKey;
  rewardSymbol?: string;
  whitelisted?: boolean;
  useExtOracle?: boolean;
  /** Force the queue/split decision instead of auto-deciding by account count.
   *  `true`  = queue `_er` as a post-delegation action (single base tx).
   *  `false` = delegate the receipt only; a keeper drives `_er` on the ER. */
  queueErAction?: boolean;
}

export interface AddCompoundingLiquidityResult extends InstructionResult {
  /** Whether `_er` was queued in the base tx. When `false`, a keeper must call
   *  `add_liquidity_and_stake_er` on the ER with the AUM accounts separately. */
  queueErAction: boolean;
}

// Solana hard cap on accounts addressable by one (legacy) tx. We reserve a small
// margin for the ComputeBudget program account and any co-bundled instructions.
const MAX_TX_ACCOUNTS = 64;
const ACCOUNT_SAFETY_MARGIN = 2;

/** add_compounding_liquidity_with_action — mints compounding (sFLP) tokens. */
export async function buildAddCompoundingLiquidityWithAction(
  program: Program,
  poolConfig: PoolConfig,
  args: AddCompoundingLiquidityArgs,
): Promise<AddCompoundingLiquidityResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const pool = poolConfig.poolAddress;

  const tok = poolConfig.getTokenFromSymbol(args.inSymbol);
  const inC = poolConfig.custodies.find((c) => c.mintKey.equals(tok.mintKey))!;
  const rewardC = poolConfig.custodies.find((c) =>
    c.mintKey.equals(poolConfig.getTokenFromSymbol(args.rewardSymbol ?? "USDC").mintKey),
  )!;

  const receipt = findCompDepositReceiptAddress(owner, inC.mintKey, program.programId)[0];

  const remaining = buildAumRemainingAccounts(poolConfig, {
    includeMarkets: true,
    useExtOracle: args.useExtOracle,
    whitelist: args.whitelisted ? findWhitelistAddress(owner, program.programId)[0] : null,
  });

  const accounts = {
    owner,
    fundingAccount: args.fundingAccount,
    compoundingTokenAccount: args.compoundingTokenAccount,
    poolCompoundingLpVault: poolConfig.compoundingLpVault,
    transferAuthority: findTransferAuthorityAddress(program.programId)[0],
    perpetuals: findPerpetualsAddress(program.programId)[0],
    pool,
    inCustody: inC.custodyAccount,
    inCustodyTokenAccount: inC.tokenAccount,
    rewardCustody: rewardC.custodyAccount,
    lpTokenMint: poolConfig.stakedLpTokenMint,
    compoundingTokenMint: poolConfig.compoundingTokenMint,
    inCustodyTokenMint: inC.mintKey,
    ...delegatedAccountFragment(program.programId, "compoundingDepositReceipt", receipt),
    tokenProgram: TOKEN_PROGRAM_ID,
    fundingTokenProgram: tok.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
    fundingMint: inC.mintKey,
    systemProgram: SystemProgram.programId,
    eventAuthority: findEventAuthorityAddress(program.programId)[0],
    program: program.programId,
    ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    ...sharedDelegationAccounts(program.programId),
  };

  // Decide whether the queued-action base tx fits the 64-account cap. The fixed
  // base account set is identical in both branches, so build it once (no
  // remaining accounts) to count, then check against the forwarded AUM tail.
  let queueErAction = args.queueErAction;
  if (queueErAction === undefined) {
    const probe = await program.methods
      .addCompoundingLiquidityWithAction({
        amountIn: args.amountIn,
        minCompoundingAmountOut: args.minCompoundingAmountOut,
        queueErAction: true,
      })
      .accountsPartial(accounts)
      .instruction();
    queueErAction =
      probe.keys.length + remaining.length <= MAX_TX_ACCOUNTS - ACCOUNT_SAFETY_MARGIN;
  }

  const ix = await program.methods
    .addCompoundingLiquidityWithAction({
      amountIn: args.amountIn,
      minCompoundingAmountOut: args.minCompoundingAmountOut,
      queueErAction,
    })
    .accountsPartial(accounts)
    // AUM accounts ride the base tx only when queuing; otherwise the keeper
    // supplies them to `_er` on the ER and the base tx stays small.
    .remainingAccounts(queueErAction ? remaining : [])
    .instruction();

  return { instructions: [ix], additionalSigners: [], queueErAction };
}
