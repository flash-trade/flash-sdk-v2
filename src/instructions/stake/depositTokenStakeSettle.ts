import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import {
  findTokenStakeDepositReceiptAddress,
  findTokenVaultTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface DepositTokenStakeSettleArgs {
  tokenMint: PublicKey; // governance token mint
  /** Account that receives funds on revert (the user's staked-token ATA). */
  receivingAccount: PublicKey;
  owner?: PublicKey;
  /** Receiving token program (governance token may be Token-2022). */
  token22?: boolean;
}

/**
 * deposit_token_stake_settle — base-chain settle of a deposited token-stake
 * after the ER commits the deposit receipt. The `escrow_auth` / `escrow`
 * accounts are the base-chain settle escrow markers (set to `owner`, mirroring
 * withdrawalSettle). Takes no args.
 */
export async function buildDepositTokenStakeSettle(
  program: Program,
  args: DepositTokenStakeSettleArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const ix = await program.methods
    .depositTokenStakeSettle()
    .accountsPartial({
      owner,
      receivingAccount: args.receivingAccount,
      tokenVaultTokenAccount: findTokenVaultTokenAccountAddress(program.programId)[0],
      tokenMint: args.tokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      depositReceipt: findTokenStakeDepositReceiptAddress(owner, program.programId)[0],
      receivingTokenProgram: args.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      escrowAuth: owner,
      escrow: owner,
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
