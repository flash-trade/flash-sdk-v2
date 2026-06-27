import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Perpetuals } from "../../idl/perpetuals";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { buildAumRemainingAccounts } from "../../utils/remainingAccounts";
import { delegatedAccountFragment, sharedDelegationAccounts } from "../../utils/delegation";
import {
  findStakingWithdrawReceiptAddress,
  findFlpStakeAddress,
  findWhitelistAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface RemoveLiquidityArgs {
  outSymbol: string; // token to receive
  receivingAccount: PublicKey; // user ATA (out)
  unstakeAmount: BN; // LP to unstake+burn
  minAmountOut: BN;
  owner?: PublicKey;
  rewardSymbol?: string; // default USDC
  whitelisted?: boolean;
  useExtOracle?: boolean;
  /** Force the queue/split decision instead of auto-deciding by account count.
   *  `true`  = queue `_er` as a post-delegation action (single base tx).
   *  `false` = delegate the receipt only; a keeper drives `_er` on the ER. */
  queueErAction?: boolean;
}

export interface RemoveLiquidityResult extends InstructionResult {
  /** Whether `_er` was queued in the base tx. When `false`, a keeper must call
   *  `remove_liquidity_er` on the ER with the AUM accounts separately. */
  queueErAction: boolean;
}

// Solana hard cap on accounts addressable by one (legacy) tx. We reserve a small
// margin for the ComputeBudget program account and any co-bundled instructions.
const MAX_TX_ACCOUNTS = 64;
const ACCOUNT_SAFETY_MARGIN = 2;

/** remove_liquidity_with_action — flp_stake is already delegated (passed plain,
 *  not re-delegated); only the staking_withdraw receipt is delegated here.
 *
 *  When the forwarded AUM account set would push the base tx past the 64-account
 *  limit, the receipt is delegated WITHOUT a queued action and a keeper drives
 *  `_er` on the ER separately. The decision is automatic (override via
 *  `args.queueErAction`). */
export async function buildRemoveLiquidityWithAction(
  program: Program,
  poolConfig: PoolConfig,
  args: RemoveLiquidityArgs,
): Promise<RemoveLiquidityResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const pool = poolConfig.poolAddress;

  const outC = poolConfig.custodies.find((c) =>
    c.mintKey.equals(poolConfig.getTokenFromSymbol(args.outSymbol).mintKey),
  )!;
  const rewardC = poolConfig.custodies.find((c) =>
    c.mintKey.equals(poolConfig.getTokenFromSymbol(args.rewardSymbol ?? "USDC").mintKey),
  )!;
  const lpTokenMint = poolConfig.stakedLpTokenMint;

  const withdrawReceipt = findStakingWithdrawReceiptAddress(owner, outC.mintKey, program.programId)[0];

  const remaining = buildAumRemainingAccounts(poolConfig, {
    includeMarkets: true,
    useExtOracle: args.useExtOracle,
    whitelist: args.whitelisted ? findWhitelistAddress(owner, program.programId)[0] : null,
  });

  const accounts = {
    owner,
    receivingAccount: args.receivingAccount,
    transferAuthority: findTransferAuthorityAddress(program.programId)[0],
    perpetuals: findPerpetualsAddress(program.programId)[0],
    pool,
    custody: outC.custodyAccount,
    rewardCustody: rewardC.custodyAccount,
    flpStakeAccount: findFlpStakeAddress(owner, pool, program.programId)[0],
    custodyTokenAccount: outC.tokenAccount,
    custodyTokenMint: outC.mintKey,
    lpTokenMint,
    poolStakedLpVault: poolConfig.stakedLpVault,
    ...delegatedAccountFragment(program.programId, "stakingWithdrawReceipt", withdrawReceipt),
    tokenProgram: TOKEN_PROGRAM_ID,
    // The custody token the user receives may be Token-2022; the LP burn uses
    // the classic token program (tokenProgram above). Token-2022 split fix.
    receivingTokenProgram: poolConfig.getTokenFromSymbol(args.outSymbol).isToken2022
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID,
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
      .removeLiquidityWithAction({
        unstakeAmount: args.unstakeAmount,
        minAmountOut: args.minAmountOut,
        queueErAction: true,
      })
      .accountsPartial(accounts)
      .instruction();
    queueErAction =
      probe.keys.length + remaining.length <= MAX_TX_ACCOUNTS - ACCOUNT_SAFETY_MARGIN;
  }

  const ix = await program.methods
    .removeLiquidityWithAction({
      unstakeAmount: args.unstakeAmount,
      minAmountOut: args.minAmountOut,
      queueErAction,
    })
    .accountsPartial(accounts)
    // AUM accounts ride the base tx only when queuing; otherwise the keeper
    // supplies them to `_er` on the ER and the base tx stays small.
    .remainingAccounts(queueErAction ? remaining : [])
    .instruction();

  return { instructions: [ix], additionalSigners: [], queueErAction };
}
