import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { findUserDepositLedgerAddress } from "../../utils";

/** init_user_deposit_ledger — create a user's deposit ledger (base only). */
export async function initializeUserDepositLedger(
  program: Program,
  owner: PublicKey,
  depositCapacity = 8,
  payer: PublicKey = program.provider.publicKey!,
) {
  const [userDepositLedger] = findUserDepositLedgerAddress(owner, program.programId);

  return program.methods
    .initUserDepositLedger({ depositCapacity })
    .accountsPartial({
      owner,
      payer,
      userDepositLedger,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}
