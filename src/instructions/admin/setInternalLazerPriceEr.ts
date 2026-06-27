import { Program } from "@coral-xyz/anchor";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { rw } from "../../utils/remainingAccounts";

export async function setInternalLazerPriceEr(
  program: Program,
  payer: PublicKey,
  pythStorage: PublicKey,
  messageData: Buffer,
  oracleAccounts: PublicKey[],
): Promise<TransactionInstruction> {
  // ER variant: only payer + pyth_storage; magic_program/magic_context have
  // const addresses (resolved by anchor). Differs from the base-layer ix.
  return program.methods
    .setInternalLazerPriceEr({ messageData })
    .accountsPartial({ payer, pythStorage })
    .remainingAccounts(oracleAccounts.map(rw))
    .instruction();
}
