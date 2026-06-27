import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import {
  findCustodySettlementReceiptAddress,
  findCustodyTokenAccountAddress,
  findTradeVaultAddress,
  findTradeVaultTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface CustodySettlementErArgs {
  pool: PublicKey;
  custody: PublicKey;
  tokenMint: PublicKey;
  /** ER tx signer; need not be the keeper (a throwaway payer is fine). */
  payer: PublicKey;
  token22?: boolean;
}

/** custody_settlement_er — ER-side commit of the custody_settlement_with_action
 *  flow. Sent directly to the MagicBlock ER (the settlement receipt is
 *  delegated). Takes no args; signed by `payer`. */
export async function buildCustodySettlementEr(
  program: Program,
  args: CustodySettlementErArgs,
): Promise<InstructionResult> {
  const ix = await program.methods
    .custodySettlementEr()
    .accountsPartial({
      payer: args.payer,
      pool: args.pool,
      custody: args.custody,
      settlementReceipt: findCustodySettlementReceiptAddress(args.custody, program.programId)[0],
      tradeVault: findTradeVaultAddress(args.tokenMint, program.programId)[0],
      tradeVaultTokenAccount: findTradeVaultTokenAccountAddress(args.tokenMint, program.programId)[0],
      custodyTokenAccount: findCustodyTokenAccountAddress(args.pool, args.tokenMint, program.programId)[0],
      tokenMint: args.tokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
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
