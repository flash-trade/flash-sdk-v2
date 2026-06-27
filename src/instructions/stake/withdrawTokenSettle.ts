import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import {
  findWithdrawTokenReceiptAddress,
  findTokenVaultTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface WithdrawTokenSettleArgs {
  tokenMint: PublicKey; // FAF (staked) token mint
  receivingTokenAccount: PublicKey; // user ATA of the FAF mint
  owner?: PublicKey;
  token22?: boolean;
}

/**
 * withdraw_token_settle — base-chain settle of a matured-unstake withdrawal
 * after the ER commits the withdraw receipt. Transfers the recorded amount and
 * closes the receipt. The `escrow_auth` / `escrow` accounts are the base-chain
 * settle escrow markers (set to `owner`, mirroring collectTokenRewardSettle).
 * Takes no args.
 */
export async function buildWithdrawTokenSettle(
  program: Program,
  args: WithdrawTokenSettleArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const ix = await program.methods
    .withdrawTokenSettle()
    .accountsPartial({
      owner,
      receivingTokenAccount: args.receivingTokenAccount,
      tokenVaultTokenAccount: findTokenVaultTokenAccountAddress(program.programId)[0],
      tokenMint: args.tokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      withdrawTokenReceipt: findWithdrawTokenReceiptAddress(owner, program.programId)[0],
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
