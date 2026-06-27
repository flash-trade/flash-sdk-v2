import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Perpetuals } from "../../idl/perpetuals";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { buildAumRemainingAccounts } from "../../utils/remainingAccounts";
import { delegatedAccountFragment, sharedDelegationAccounts } from "../../utils/delegation";
import {
  findCompoundFeesReceiptAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface CompoundFeesArgs {
  keeper?: PublicKey; // signer; defaults to wallet
  rewardSymbol?: string;
  useExtOracle?: boolean;
  /** Force the queue/split decision instead of auto-deciding by account count.
   *  `true`  = queue `_er` as a post-delegation action (single base tx).
   *  `false` = delegate the receipt only; a keeper drives `_er` on the ER. */
  queueErAction?: boolean;
}

export interface CompoundFeesResult extends InstructionResult {
  /** Whether `_er` was queued in the base tx. When `false`, a keeper must call
   *  `compound_fees_er` on the ER with the AUM accounts separately. */
  queueErAction: boolean;
}

// Solana hard cap on accounts addressable by one (legacy) tx. We reserve a small
// margin for the ComputeBudget program account and any co-bundled instructions.
const MAX_TX_ACCOUNTS = 64;
const ACCOUNT_SAFETY_MARGIN = 2;

/** compound_fees_with_action — keeper-initiated; compounds pool fee rewards
 *  into LP. Receipt is keyed by (keeper, pool).
 *
 *  When the forwarded AUM account set would push the base tx past the 64-account
 *  limit, the receipt is delegated WITHOUT a queued action and a keeper drives
 *  `_er` on the ER separately. The decision is automatic (override via
 *  `args.queueErAction`). */
export async function buildCompoundFeesWithAction(
  program: Program,
  poolConfig: PoolConfig,
  args: CompoundFeesArgs = {},
): Promise<CompoundFeesResult> {
  const keeper = args.keeper ?? program.provider.publicKey!;
  const pool = poolConfig.poolAddress;

  const rewardC = poolConfig.custodies.find((c) =>
    c.mintKey.equals(poolConfig.getTokenFromSymbol(args.rewardSymbol ?? "USDC").mintKey),
  )!;
  const receipt = findCompoundFeesReceiptAddress(keeper, pool, program.programId)[0];

  const remaining = buildAumRemainingAccounts(poolConfig, {
    includeMarkets: true,
    useExtOracle: args.useExtOracle,
    whitelist: null,
  });

  const accounts = {
    keeper,
    perpetuals: findPerpetualsAddress(program.programId)[0],
    pool,
    rewardCustody: rewardC.custodyAccount,
    lpTokenMint: poolConfig.stakedLpTokenMint,
    poolCompoundingLpVault: poolConfig.compoundingLpVault,
    ...delegatedAccountFragment(program.programId, "compoundFeesReceipt", receipt),
    transferAuthority: findTransferAuthorityAddress(program.programId)[0],
    tokenProgram: TOKEN_PROGRAM_ID,
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
      .compoundFeesWithAction({
        queueErAction: true,
      })
      .accountsPartial(accounts)
      .instruction();
    queueErAction =
      probe.keys.length + remaining.length <= MAX_TX_ACCOUNTS - ACCOUNT_SAFETY_MARGIN;
  }

  const ix = await program.methods
    .compoundFeesWithAction({
      queueErAction,
    })
    .accountsPartial(accounts)
    // AUM accounts ride the base tx only when queuing; otherwise the keeper
    // supplies them to `_er` on the ER and the base tx stays small.
    .remainingAccounts(queueErAction ? remaining : [])
    .instruction();

  return { instructions: [ix], additionalSigners: [], queueErAction };
}
