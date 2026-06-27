import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import {
  findCollectRebateReceiptAddress,
  findRebateTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface CollectRebateSettleArgs {
  rebateTokenMint: PublicKey; // rebate token mint
  receivingTokenAccount: PublicKey; // user ATA of the rebate mint
  owner?: PublicKey;
  token22?: boolean;
}

/**
 * collect_rebate_settle — base-chain settle of a rebate claim after the ER
 * commits the collect_rebate receipt. The `escrow_auth` / `escrow` accounts are
 * the base-chain settle escrow markers (set to `owner`, mirroring
 * withdrawalSettle). Takes no args.
 */
export async function buildCollectRebateSettle(
  program: Program,
  args: CollectRebateSettleArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const ix = await program.methods
    .collectRebateSettle()
    .accountsPartial({
      owner,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      receivingTokenAccount: args.receivingTokenAccount,
      rebateTokenAccount: findRebateTokenAccountAddress(program.programId)[0],
      rebateTokenMint: args.rebateTokenMint,
      collectRebateReceipt: findCollectRebateReceiptAddress(owner, program.programId)[0],
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
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
