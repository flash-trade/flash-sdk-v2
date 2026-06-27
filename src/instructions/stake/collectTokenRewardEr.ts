import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import {
  findCollectTokenRewardReceiptAddress,
  findTokenStakeAddress,
  findTokenVaultAddress,
  findTokenVaultTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface CollectTokenRewardErArgs {
  tokenMint: PublicKey; // reward (governance) token mint
  receivingTokenAccount: PublicKey; // user ATA of the reward mint
  /** ER tx fee payer + signer (e.g. an ephemeral keypair; need not be `owner`). */
  payer: PublicKey;
  owner?: PublicKey;
  token22?: boolean;
}

/**
 * collect_token_reward_er — the ER-side commit step of the reward-claim flow.
 * Sent directly to the MagicBlock ER (the reward receipt is delegated). Takes
 * no args. Mirrors the on-chain instruction.
 */
export async function buildCollectTokenRewardEr(
  program: Program,
  args: CollectTokenRewardErArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const ix = await program.methods
    .collectTokenRewardEr()
    .accountsPartial({
      owner,
      payer: args.payer,
      tokenVault: findTokenVaultAddress(program.programId)[0],
      tokenStakeAccount: findTokenStakeAddress(owner, program.programId)[0],
      collectTokenRewardReceipt: findCollectTokenRewardReceiptAddress(owner, program.programId)[0],
      tokenMint: args.tokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      receivingTokenAccount: args.receivingTokenAccount,
      tokenVaultTokenAccount: findTokenVaultTokenAccountAddress(program.programId)[0],
      tokenProgram: args.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      programId: program.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      magicProgram: MAGIC_PROGRAM_ID,
      magicContext: MAGIC_CONTEXT_ID,
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
