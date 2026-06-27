import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import { ro } from "../../utils/remainingAccounts";
import {
  findCollectStakeRewardReceiptAddress,
  findTokenStakeAddress,
  findFlpStakeAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface CollectStakeRewardErArgs {
  receivingTokenAccount: PublicKey; // user ATA of the reward mint
  /** ER tx signer; need not be the owner (a throwaway payer is fine). */
  payer: PublicKey;
  owner?: PublicKey;
  rewardSymbol?: string; // default USDC
  /** Pass the owner's token_stake as the optional remaining account for fee boost. */
  includeTokenStake?: boolean;
  tokenStakeAccount?: PublicKey;
}

/** collect_stake_reward_er — ER-side commit of the
 *  collect_stake_reward_with_action flow. Sent directly to the MagicBlock ER
 *  (the collect stake reward receipt is delegated). Takes no args; signed by
 *  `payer`. */
export async function buildCollectStakeRewardEr(
  program: Program,
  poolConfig: PoolConfig,
  args: CollectStakeRewardErArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const pool = poolConfig.poolAddress;

  const rewardC = poolConfig.custodies.find((c) =>
    c.mintKey.equals(poolConfig.getTokenFromSymbol(args.rewardSymbol ?? "USDC").mintKey),
  )!;
  const remaining =
    args.includeTokenStake || args.tokenStakeAccount
      ? [ro(args.tokenStakeAccount ?? findTokenStakeAddress(owner, program.programId)[0])]
      : [];

  const ix = await program.methods
    .collectStakeRewardEr()
    .accountsPartial({
      owner,
      payer: args.payer,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      pool,
      rewardCustody: rewardC.custodyAccount,
      flpStakeAccount: findFlpStakeAddress(owner, pool, program.programId)[0],
      collectStakeRewardReceipt: findCollectStakeRewardReceiptAddress(owner, pool, program.programId)[0],
      rewardMint: rewardC.mintKey,
      receivingTokenAccount: args.receivingTokenAccount,
      rewardCustodyTokenAccount: rewardC.tokenAccount,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      programId: program.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      magicProgram: MAGIC_PROGRAM_ID,
      magicContext: MAGIC_CONTEXT_ID,
    })
    .remainingAccounts(remaining)
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
