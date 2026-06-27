import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Perpetuals } from "../../idl/perpetuals";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { ro } from "../../utils/remainingAccounts";
import { delegatedAccountFragment, sharedDelegationAccounts } from "../../utils/delegation";
import {
  findCollectStakeRewardReceiptAddress,
  findTokenStakeAddress,
  findFlpStakeAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface CollectStakeRewardArgs {
  receivingTokenAccount: PublicKey; // user ATA of the reward mint
  owner?: PublicKey;
  rewardSymbol?: string; // default USDC
  includeTokenStake?: boolean; // pass token_stake for fee boost
}

/** collect_stake_reward_with_action — ER inlines a stake refresh, claims the
 *  accrued reward; settle transfers it out. Optional token_stake (fee boost)
 *  is the only remaining account. */
export function buildCollectStakeRewardWithAction(
  program: Program,
  poolConfig: PoolConfig,
  args: CollectStakeRewardArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const pool = poolConfig.poolAddress;

  const rewardC = poolConfig.custodies.find((c) =>
    c.mintKey.equals(poolConfig.getTokenFromSymbol(args.rewardSymbol ?? "USDC").mintKey),
  )!;
  const receipt = findCollectStakeRewardReceiptAddress(owner, pool, program.programId)[0];

  const remaining = args.includeTokenStake
    ? [ro(findTokenStakeAddress(owner, program.programId)[0])]
    : [];

  return program.methods
    .collectStakeRewardWithAction({})
    .accountsPartial({
      owner,
      receivingTokenAccount: args.receivingTokenAccount,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      pool,
      rewardCustody: rewardC.custodyAccount,
      flpStakeAccount: findFlpStakeAddress(owner, pool, program.programId)[0],
      rewardMint: rewardC.mintKey,
      rewardCustodyTokenAccount: rewardC.tokenAccount,
      ...delegatedAccountFragment(program.programId, "collectStakeRewardReceipt", receipt),
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      ...sharedDelegationAccounts(program.programId),
    })
    .remainingAccounts(remaining)
    .instruction()
    .then((ix) => ({ instructions: [ix], additionalSigners: [] }));
}
