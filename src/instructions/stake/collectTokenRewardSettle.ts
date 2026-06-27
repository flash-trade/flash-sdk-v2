import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import {
  findCollectTokenRewardReceiptAddress,
  findTokenVaultTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface CollectTokenRewardSettleArgs {
  tokenMint: PublicKey; // reward (governance) token mint
  receivingTokenAccount: PublicKey; // user ATA of the reward mint
  owner?: PublicKey;
  token22?: boolean;
}

/**
 * collect_token_reward_settle — base-chain settle of a reward claim after the
 * ER commits the reward receipt. The `escrow_auth` / `escrow` accounts are the
 * base-chain settle escrow markers (set to `owner`, mirroring
 * withdrawalSettle). Takes no args.
 */
export async function buildCollectTokenRewardSettle(
  program: Program,
  args: CollectTokenRewardSettleArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const ix = await program.methods
    .collectTokenRewardSettle()
    .accountsPartial({
      owner,
      receivingTokenAccount: args.receivingTokenAccount,
      tokenVaultTokenAccount: findTokenVaultTokenAccountAddress(program.programId)[0],
      tokenMint: args.tokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      collectTokenRewardReceipt: findCollectTokenRewardReceiptAddress(owner, program.programId)[0],
      tokenProgram: args.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      escrowAuth: owner,
      escrow: owner,
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
