import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import {
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findTokenVaultAddress,
  findRevenueTokenAccountAddress,
  findProtocolVaultAddress,
  findProtocolTokenAccountAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface MoveProtocolFeesArgs {
  pool: PublicKey;
  rewardCustody: PublicKey;
  rewardCustodyTokenAccount: PublicKey;
  tokenMint: PublicKey;
  token22?: boolean;
}

/** move_protocol_fees — keeper op: move the protocol's share of fees from the
 *  pool's reward custody into the protocol vault. Takes no args. */
export async function buildMoveProtocolFees(
  program: Program,
  args: MoveProtocolFeesArgs,
): Promise<InstructionResult> {
  const ix = await program.methods
    .moveProtocolFees()
    .accountsPartial({
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      tokenVault: findTokenVaultAddress(program.programId)[0],
      pool: args.pool,
      rewardCustody: args.rewardCustody,
      rewardCustodyTokenAccount: args.rewardCustodyTokenAccount,
      revenueTokenAccount: findRevenueTokenAccountAddress(program.programId)[0],
      protocolVault: findProtocolVaultAddress(program.programId)[0],
      protocolTokenAccount: findProtocolTokenAccountAddress(program.programId)[0],
      tokenProgram: args.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      tokenMint: args.tokenMint,
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
