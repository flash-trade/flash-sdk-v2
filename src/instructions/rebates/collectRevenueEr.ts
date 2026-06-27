import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID, validatorKeyForProgramId } from "../../constants";
import {
  findCollectRevenueReceiptAddress,
  findTokenStakeAddress,
  findTokenVaultAddress,
  findRevenueTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
  findMagicFeeVaultAddress,
  findReallocVaultAddress,
} from "../../utils";

export interface CollectRevenueErArgs {
  revenueTokenMint: PublicKey; // revenue token mint
  receivingRevenueAccount: PublicKey; // user ATA of the revenue mint
  /** ER tx signer and settle-action escrow authority; need not be `owner`. */
  payer: PublicKey;
  owner?: PublicKey;
  token22?: boolean;
}

/**
 * collect_revenue_er — the ER-side commit step of the revenue-claim flow. Sent
 * directly to the MagicBlock ER (the collect_revenue receipt is delegated).
 * Takes no args. Mirrors the on-chain instruction.
 */
export async function buildCollectRevenueEr(
  program: Program,
  args: CollectRevenueErArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const validator = validatorKeyForProgramId(program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [magicFeeVault] = findMagicFeeVaultAddress(validator);

  const ix = await program.methods
    .collectRevenueEr()
    .accountsPartial({
      owner,
      payer: args.payer,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      tokenVault: findTokenVaultAddress(program.programId)[0],
      tokenStakeAccount: findTokenStakeAddress(owner, program.programId)[0],
      collectRevenueReceipt: findCollectRevenueReceiptAddress(owner, program.programId)[0],
      receivingRevenueAccount: args.receivingRevenueAccount,
      revenueTokenAccount: findRevenueTokenAccountAddress(program.programId)[0],
      revenueTokenMint: args.revenueTokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      tokenProgram: args.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      programId: program.programId,
      reallocVault,
      magicFeeVault,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      magicProgram: MAGIC_PROGRAM_ID,
      magicContext: MAGIC_CONTEXT_ID,
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
