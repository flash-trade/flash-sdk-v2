import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import {
  findSettleRebatesReceiptAddress,
  findRebateTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface SettleRebatesSettleArgs {
  pool: PublicKey;
  rewardCustody: PublicKey;
  rewardCustodyTokenAccount: PublicKey;
  tokenMint: PublicKey;
  keeper?: PublicKey;
  token22?: boolean;
}

/** settle_rebates_settle — base-chain settle of the settle_rebates flow after the
 *  ER commits the receipt. The `escrow_auth` / `escrow` accounts are the
 *  base-chain settle escrow markers (set to `keeper`, mirroring
 *  collectRebateSettle). Takes no args. */
export async function buildSettleRebatesSettle(
  program: Program,
  args: SettleRebatesSettleArgs,
): Promise<InstructionResult> {
  const keeper = args.keeper ?? program.provider.publicKey!;

  const ix = await program.methods
    .settleRebatesSettle()
    .accountsPartial({
      keeper,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      pool: args.pool,
      rewardCustody: args.rewardCustody,
      rewardCustodyTokenAccount: args.rewardCustodyTokenAccount,
      rebateTokenAccount: findRebateTokenAccountAddress(program.programId)[0],
      tokenMint: args.tokenMint,
      settleRebatesReceipt: findSettleRebatesReceiptAddress(keeper, args.pool, program.programId)[0],
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
