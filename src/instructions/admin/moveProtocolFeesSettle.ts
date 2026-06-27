import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import {
  findMoveProtocolFeesReceiptAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findRevenueTokenAccountAddress,
  findProtocolVaultAddress,
  findProtocolTokenAccountAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface MoveProtocolFeesSettleArgs {
  pool: PublicKey;
  rewardCustodyTokenAccount: PublicKey;
  tokenMint: PublicKey;
  keeper?: PublicKey;
  token22?: boolean;
}

/** move_protocol_fees_settle — base-chain settle of the move_protocol_fees flow
 *  after the ER commits the receipt. The `escrow_auth` / `escrow` accounts are
 *  the base-chain settle escrow markers (set to `keeper`). Takes no args. */
export async function buildMoveProtocolFeesSettle(
  program: Program,
  args: MoveProtocolFeesSettleArgs,
): Promise<InstructionResult> {
  const keeper = args.keeper ?? program.provider.publicKey!;

  const ix = await program.methods
    .moveProtocolFeesSettle()
    .accountsPartial({
      keeper,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      pool: args.pool,
      rewardCustodyTokenAccount: args.rewardCustodyTokenAccount,
      revenueTokenAccount: findRevenueTokenAccountAddress(program.programId)[0],
      protocolTokenAccount: findProtocolTokenAccountAddress(program.programId)[0],
      tokenMint: args.tokenMint,
      protocolVault: findProtocolVaultAddress(program.programId)[0],
      moveProtocolFeesReceipt: findMoveProtocolFeesReceiptAddress(keeper, args.pool, program.programId)[0],
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      tokenProgram: args.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      escrowAuth: keeper,
      escrow: keeper,
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
