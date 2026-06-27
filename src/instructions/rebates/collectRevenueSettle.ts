import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import {
  findCollectRevenueReceiptAddress,
  findRevenueTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface CollectRevenueSettleArgs {
  revenueTokenMint: PublicKey; // revenue token mint
  receivingRevenueAccount: PublicKey; // user ATA of the revenue mint
  owner?: PublicKey;
  token22?: boolean;
}

/**
 * collect_revenue_settle — base-chain settle of a revenue claim after the ER
 * commits the collect_revenue receipt. The `escrow_auth` / `escrow` accounts
 * are the base-chain settle escrow markers (set to `owner`, mirroring
 * withdrawalSettle). Takes no args.
 */
export async function buildCollectRevenueSettle(
  program: Program,
  args: CollectRevenueSettleArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const ix = await program.methods
    .collectRevenueSettle()
    .accountsPartial({
      owner,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      receivingRevenueAccount: args.receivingRevenueAccount,
      revenueTokenAccount: findRevenueTokenAccountAddress(program.programId)[0],
      revenueTokenMint: args.revenueTokenMint,
      collectRevenueReceipt: findCollectRevenueReceiptAddress(owner, program.programId)[0],
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
