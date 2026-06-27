import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import {
  findBasketAddress,
  findUserDepositLedgerAddress,
  findWithdrawalEscrowReceiptAddress,
  findTradeVaultAddress,
  findTradeVaultTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface WithdrawalErArgs {
  owner: PublicKey;
  tokenMint: PublicKey;
  ownerTokenAccount: PublicKey;
  /** ER tx signer; need not be the owner (a throwaway payer is fine). */
  payer: PublicKey;
  token22?: boolean;
}

/** withdrawal_er — ER-side commit of the withdrawal_with_action flow. Sent
 *  directly to the MagicBlock ER (the withdrawal escrow receipt is delegated).
 *  Takes no args; signed by `payer`. */
export async function buildWithdrawalEr(
  program: Program,
  args: WithdrawalErArgs,
): Promise<InstructionResult> {
  const ix = await program.methods
    .withdrawalEr()
    .accountsPartial({
      owner: args.owner,
      payer: args.payer,
      basket: findBasketAddress(args.owner, program.programId)[0],
      userDepositLedger: findUserDepositLedgerAddress(args.owner, program.programId)[0],
      withdrawalEscrowReceipt: findWithdrawalEscrowReceiptAddress(args.owner, args.tokenMint, program.programId)[0],
      ownerTokenAccount: args.ownerTokenAccount,
      tokenMint: args.tokenMint,
      tradeVault: findTradeVaultAddress(args.tokenMint, program.programId)[0],
      tradeVaultTokenAccount: findTradeVaultTokenAccountAddress(args.tokenMint, program.programId)[0],
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
