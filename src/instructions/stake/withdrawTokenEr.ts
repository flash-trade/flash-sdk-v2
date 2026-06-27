import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import {
  findWithdrawTokenReceiptAddress,
  findTokenStakeAddress,
  findTokenVaultAddress,
  findTokenVaultTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface WithdrawTokenErArgs {
  tokenMint: PublicKey; // FAF (staked) token mint
  receivingTokenAccount: PublicKey; // user ATA of the FAF mint
  /** ER tx fee payer + signer (e.g. an ephemeral keypair; need not be `owner`). */
  payer: PublicKey;
  owner?: PublicKey;
  token22?: boolean;
}

/**
 * withdraw_token_er — the ER-side commit step of the matured-unstake withdrawal
 * flow. Sent directly to the MagicBlock ER (the withdraw receipt is delegated).
 * Reads the target withdraw_request_id off the receipt; takes no args. Mirrors
 * collect_token_reward_er.
 */
export async function buildWithdrawTokenEr(
  program: Program,
  args: WithdrawTokenErArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const ix = await program.methods
    .withdrawTokenEr()
    .accountsPartial({
      owner,
      payer: args.payer,
      tokenVault: findTokenVaultAddress(program.programId)[0],
      tokenStakeAccount: findTokenStakeAddress(owner, program.programId)[0],
      withdrawTokenReceipt: findWithdrawTokenReceiptAddress(owner, program.programId)[0],
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
