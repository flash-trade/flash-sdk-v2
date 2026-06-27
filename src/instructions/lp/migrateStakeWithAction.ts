import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Perpetuals } from "../../idl/perpetuals";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { buildAumRemainingAccounts, ro } from "../../utils/remainingAccounts";
import { delegatedAccountFragment, sharedDelegationAccounts } from "../../utils/delegation";
import {
  findMigrateStakeReceiptAddress,
  findTokenStakeAddress,
  findFlpStakeAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface MigrateStakeArgs {
  compoundingTokenAccount: PublicKey; // user ATA of compounding (sFLP) mint
  amount: BN; // staked LP to migrate
  owner?: PublicKey;
  rewardSymbol?: string;
  includeTokenStake?: boolean;
  useExtOracle?: boolean;
  /** Force the queue/split decision instead of auto-deciding by account count.
   *  `true`  = queue `_er` as a post-delegation action (single base tx).
   *  `false` = delegate the receipt only; a keeper drives `_er` on the ER. */
  queueErAction?: boolean;
}

export interface MigrateStakeResult extends InstructionResult {
  /** Whether `_er` was queued in the base tx. When `false`, a keeper must call
   *  `add_liquidity_and_stake_er` on the ER with the AUM accounts separately. */
  queueErAction: boolean;
}

// Solana hard cap on accounts addressable by one (legacy) tx. We reserve a small
// margin for the ComputeBudget program account and any co-bundled instructions.
const MAX_TX_ACCOUNTS = 64;
const ACCOUNT_SAFETY_MARGIN = 2;

/** migrate_stake_with_action — staked LP → compounding (sFLP). flp_stake is
 *  already delegated (passed plain); only the migrate receipt is delegated. */
export async function buildMigrateStakeWithAction(
  program: Program,
  poolConfig: PoolConfig,
  args: MigrateStakeArgs,
): Promise<MigrateStakeResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const pool = poolConfig.poolAddress;

  const rewardC = poolConfig.custodies.find((c) =>
    c.mintKey.equals(poolConfig.getTokenFromSymbol(args.rewardSymbol ?? "USDC").mintKey),
  )!;
  const receipt = findMigrateStakeReceiptAddress(owner, pool, program.programId)[0];

  const remaining = buildAumRemainingAccounts(poolConfig, {
    includeMarkets: true,
    useExtOracle: args.useExtOracle,
    whitelist: null,
  });
  if (args.includeTokenStake) remaining.push(ro(findTokenStakeAddress(owner, program.programId)[0]));

  const accounts = {
    owner,
    compoundingTokenAccount: args.compoundingTokenAccount,
    transferAuthority: findTransferAuthorityAddress(program.programId)[0],
    perpetuals: findPerpetualsAddress(program.programId)[0],
    pool,
    rewardCustody: rewardC.custodyAccount,
    rewardCustodyOracleAccount: args.useExtOracle ? rewardC.extOracleAccount : rewardC.intOracleAccount,
    flpStakeAccount: findFlpStakeAddress(owner, pool, program.programId)[0],
    poolStakedLpVault: poolConfig.stakedLpVault,
    poolCompoundingLpVault: poolConfig.compoundingLpVault,
    lpTokenMint: poolConfig.stakedLpTokenMint,
    compoundingTokenMint: poolConfig.compoundingTokenMint,
    ...delegatedAccountFragment(program.programId, "migrateStakeReceipt", receipt),
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
      .migrateStakeWithAction({
        amount: args.amount,
        queueErAction: true,
      })
      .accountsPartial(accounts)
      .instruction();
    queueErAction =
      probe.keys.length + remaining.length <= MAX_TX_ACCOUNTS - ACCOUNT_SAFETY_MARGIN;
  }

  const ix = await program.methods
    .migrateStakeWithAction({
      amount: args.amount,
      queueErAction,
    })
    .accountsPartial(accounts)
    // AUM accounts ride the base tx only when queuing; otherwise the keeper
    // supplies them to `_er` on the ER and the base tx stays small.
    .remainingAccounts(queueErAction ? remaining : [])
    .instruction();

  return { instructions: [ix], additionalSigners: [], queueErAction };
}
