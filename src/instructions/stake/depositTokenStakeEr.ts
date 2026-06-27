import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import {
  findTokenStakeAddress,
  findTokenStakeDepositReceiptAddress,
  findTokenVaultAddress,
  findTokenVaultTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface DepositTokenStakeErArgs {
  tokenMint: PublicKey; // governance token mint
  /** ER tx fee payer + signer (e.g. an ephemeral keypair; need not be `owner`). */
  payer: PublicKey;
  /** Account that receives funds on revert (the user's staked-token ATA). */
  receivingAccount: PublicKey;
  /** Token-stake owner / receipt owner. Defaults to the provider wallet. */
  owner?: PublicKey;
  /** Receiving token program (governance token may be Token-2022). */
  token22?: boolean;
}

/**
 * deposit_token_stake_er — the ER-side commit step of the token-stake deposit
 * flow. Sent directly to the MagicBlock ER (token_stake + deposit receipt are
 * delegated). Takes no args (amount comes from the delegated deposit receipt).
 * Mirrors the on-chain instruction.
 */
export async function buildDepositTokenStakeEr(
  program: Program,
  args: DepositTokenStakeErArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const ix = await program.methods
    .depositTokenStakeEr()
    .accountsPartial({
      owner,
      payer: args.payer,
      tokenVault: findTokenVaultAddress(program.programId)[0],
      tokenStakeAccount: findTokenStakeAddress(owner, program.programId)[0],
      depositReceipt: findTokenStakeDepositReceiptAddress(owner, program.programId)[0],
      tokenMint: args.tokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      receivingAccount: args.receivingAccount,
      tokenVaultTokenAccount: findTokenVaultTokenAccountAddress(program.programId)[0],
      receivingTokenProgram: args.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
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
