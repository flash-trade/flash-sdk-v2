import { PublicKey } from "@solana/web3.js";
import { DELEGATION_PROGRAM_ID } from "../constants";
import { findDelegationSiblings } from "../utils";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Build the `accountsPartial` fragment for one PDA delegated by a
 * `#[delegate]` instruction. The macro injects, per delegated account named
 * `<x>`: `buffer<X>`, `delegationRecord<X>`, `delegationMetadata<X>`, and `<x>`
 * itself. Shared `ownerProgram` / `delegationProgram` are added once by the
 * caller (see `sharedDelegationAccounts`).
 *
 * @param accountName camelCase IDL account name, e.g. "swapReceipt",
 *                    "flpStakeAccount", "depositReceipt".
 */
export function delegatedAccountFragment(
  programId: PublicKey,
  accountName: string,
  pda: PublicKey,
): Record<string, PublicKey> {
  const sib = findDelegationSiblings(pda, programId);
  const X = cap(accountName);
  return {
    [`buffer${X}`]: sib.buffer,
    [`delegationRecord${X}`]: sib.delegationRecord,
    [`delegationMetadata${X}`]: sib.delegationMetadata,
    [accountName]: pda,
  };
}

/** The two program accounts shared by every `#[delegate]` instruction. */
export function sharedDelegationAccounts(programId: PublicKey): Record<string, PublicKey> {
  return {
    ownerProgram: programId,
    delegationProgram: DELEGATION_PROGRAM_ID,
  };
}
