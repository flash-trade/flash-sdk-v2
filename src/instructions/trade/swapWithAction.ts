import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Perpetuals } from "../../idl/perpetuals";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { buildAumRemainingAccounts } from "../../utils/remainingAccounts";
import { delegatedAccountFragment, sharedDelegationAccounts } from "../../utils/delegation";
import {
  findSwapReceiptAddress,
  findWhitelistAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface SwapWithActionArgs {
  inSymbol: string;
  outSymbol: string;
  inAccount: PublicKey; // user ATA (in)
  outAccount: PublicKey; // user ATA (out)
  amountIn: BN;
  minAmountOut: BN;
  owner?: PublicKey; // defaults to wallet
  useExtOracle?: boolean;
  /** Force the queue/split decision instead of auto-deciding by account count.
   *  `true`  = queue `_er` as a post-delegation action (single base tx).
   *  `false` = delegate the receipt only; a keeper drives `_er` on the ER. */
  queueErAction?: boolean;
}

export interface SwapResult extends InstructionResult {
  /** Whether `_er` was queued in the base tx. When `false`, a keeper must call
   *  `add_liquidity_and_stake_er` on the ER with the AUM accounts separately. */
  queueErAction: boolean;
  swapReceipt: PublicKey;
}

// Solana hard cap on accounts addressable by one (legacy) tx. We reserve a small
// margin for the ComputeBudget program account and any co-bundled instructions.
const MAX_TX_ACCOUNTS = 64;
const ACCOUNT_SAFETY_MARGIN = 2;

/**
 * swap_with_action — single base-layer entry for the ER swap flow.
 *
 * The user signs ONE transaction. It locks `amountIn`, creates + delegates the
 * swap receipt with `swap_er` queued as a post-delegation action; the validator
 * then runs swap_er (ER) → swap_settle (base) automatically.
 * Use `awaitReceiptOutcome` (accounts/receipts.ts) to wait for completion.
 *
 * Whitelist is MANDATORY for swap and must be the last remaining account.
 */
export async function buildSwapWithAction(
  program: Program,
  poolConfig: PoolConfig,
  args: SwapWithActionArgs,
): Promise<SwapResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const inTok = poolConfig.getTokenFromSymbol(args.inSymbol);
  const outTok = poolConfig.getTokenFromSymbol(args.outSymbol);
  const inC = poolConfig.custodies.find((c) => c.mintKey.equals(inTok.mintKey))!;
  const outC = poolConfig.custodies.find((c) => c.mintKey.equals(outTok.mintKey))!;

  const swapReceipt = findSwapReceiptAddress(owner, inC.mintKey, outC.mintKey, program.programId)[0];

  const remaining = buildAumRemainingAccounts(poolConfig, {
    includeMarkets: false, // swap AUM is ExcludePnl — no markets
    useExtOracle: args.useExtOracle,
    whitelist: findWhitelistAddress(owner, program.programId)[0], // mandatory
  });

  const accounts = {
    owner,
    inAccount: args.inAccount,
    outAccount: args.outAccount,
    transferAuthority: findTransferAuthorityAddress(program.programId)[0],
    perpetuals: findPerpetualsAddress(program.programId)[0],
    pool: poolConfig.poolAddress,
    inCustody: inC.custodyAccount,
    outCustody: outC.custodyAccount,
    inCustodyTokenAccount: inC.tokenAccount,
    outCustodyTokenAccount: outC.tokenAccount,
    inMint: inC.mintKey,
    outMint: outC.mintKey,
    ...delegatedAccountFragment(program.programId, "swapReceipt", swapReceipt),
    inTokenProgram: inTok.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
    outTokenProgram: outTok.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
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
      .swapWithAction({
        amountIn: args.amountIn,
        minAmountOut: args.minAmountOut,
        queueErAction: true,
      })
      .accountsPartial(accounts)
      .instruction();
    queueErAction =
      probe.keys.length + remaining.length <= MAX_TX_ACCOUNTS - ACCOUNT_SAFETY_MARGIN;
  }

  const ix = await program.methods
    .swapWithAction({
      amountIn: args.amountIn,
      minAmountOut: args.minAmountOut,
      queueErAction,
    })
    .accountsPartial(accounts)
    // AUM accounts ride the base tx only when queuing; otherwise the keeper
    // supplies them to `_er` on the ER and the base tx stays small.
    .remainingAccounts(queueErAction ? remaining : [])
    .instruction();

  // Return the receipt PDA so callers can awaitOutcome("swapReceipt", …)
  // without re-deriving it (matches the documented flow).
  return { instructions: [ix], additionalSigners: [], queueErAction, swapReceipt };
}
