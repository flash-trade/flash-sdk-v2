import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import {
  findMoveProtocolFeesReceiptAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findTokenVaultAddress,
  findRevenueTokenAccountAddress,
  findProtocolVaultAddress,
  findProtocolTokenAccountAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface MoveProtocolFeesErArgs {
  pool: PublicKey;
  rewardCustody: PublicKey;
  rewardCustodyTokenAccount: PublicKey;
  tokenMint: PublicKey;
  /** ER tx signer; need not be the keeper (a throwaway payer is fine). */
  payer: PublicKey;
  keeper?: PublicKey;
  token22?: boolean;
}

/** move_protocol_fees_er — ER-side commit of the move_protocol_fees flow. Sent
 *  directly to the MagicBlock ER (the receipt is delegated). Takes no args;
 *  signed by `payer`. */
export async function buildMoveProtocolFeesEr(
  program: Program,
  args: MoveProtocolFeesErArgs,
): Promise<InstructionResult> {
  const keeper = args.keeper ?? program.provider.publicKey!;

  const ix = await program.methods
    .moveProtocolFeesEr()
    .accountsPartial({
      keeper,
      payer: args.payer,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      pool: args.pool,
      rewardCustody: args.rewardCustody,
      protocolVault: findProtocolVaultAddress(program.programId)[0],
      tokenVault: findTokenVaultAddress(program.programId)[0],
      moveProtocolFeesReceipt: findMoveProtocolFeesReceiptAddress(keeper, args.pool, program.programId)[0],
      rewardCustodyTokenAccount: args.rewardCustodyTokenAccount,
      revenueTokenAccount: findRevenueTokenAccountAddress(program.programId)[0],
      protocolTokenAccount: findProtocolTokenAccountAddress(program.programId)[0],
      tokenMint: args.tokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
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
