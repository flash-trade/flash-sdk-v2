import { AccountMeta, PublicKey, SystemProgram } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { DELEGATION_PROGRAM_ID } from "../../constants";
import { rw } from "../../utils/remainingAccounts";
import {
  findMultisigAddress,
  findEventAuthorityAddress,
  findDelegationSiblings,
} from "../../utils";

/**
 * batch_delegate_trading — admin/keeper sweep: packs each `trading` account
 * (PDA seeds [b"trading", nft_mint]) plus its 3 sibling delegation PDAs into
 * remaining accounts as chunks of 4.
 */
export async function batchDelegateTrading(
  program: Program,
  tradingAccounts: PublicKey[],
  admin?: PublicKey,
) {
  const remaining: AccountMeta[] = [];
  for (const trading of tradingAccounts) {
    const sib = findDelegationSiblings(trading, program.programId);
    remaining.push(
      rw(trading),
      rw(sib.buffer),
      rw(sib.delegationRecord),
      rw(sib.delegationMetadata),
    );
  }

  return program.methods
    .batchDelegateTrading({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig: findMultisigAddress(program.programId)[0],
      ownerProgram: program.programId,
      delegationProgram: DELEGATION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
    })
    .remainingAccounts(remaining)
    .instruction();
}
