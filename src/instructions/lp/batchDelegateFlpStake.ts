import { AccountMeta, PublicKey, SystemProgram } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { DELEGATION_PROGRAM_ID } from "../../constants";
import { InstructionResult } from "../../types";
import { rw } from "../../utils/remainingAccounts";
import {
  findMultisigAddress,
  findEventAuthorityAddress,
  findDelegationSiblings,
} from "../../utils";

/**
 * batch_delegate_flp_stake — admin/keeper sweep. For each flp_stake, packs the
 * 3 sibling delegation PDAs into remaining accounts as chunks of 4. Multisig-
 * gated; account ordering must be preserved across all signers. ~12 stakes/tx
 * without ALT, ~40-50 with v0 + ALT. SENT ON THE BASE LAYER.
 */
export async function batchDelegateFlpStake(
  program: Program,
  flpStakes: PublicKey[],
  admin?: PublicKey,
): Promise<InstructionResult> {
  if (flpStakes.length === 0) return { instructions: [], additionalSigners: [] };

  const remaining: AccountMeta[] = [];
  for (const flpStake of flpStakes) {
    const sib = findDelegationSiblings(flpStake, program.programId);
    remaining.push(
      rw(flpStake), rw(sib.buffer), rw(sib.delegationRecord), rw(sib.delegationMetadata),
    );
  }

  const ix = await program.methods.batchDelegateFlpStake()
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!, multisig: findMultisigAddress(program.programId)[0],
      ownerProgram: program.programId, delegationProgram: DELEGATION_PROGRAM_ID,
      systemProgram: SystemProgram.programId, eventAuthority: findEventAuthorityAddress(program.programId)[0], program: program.programId,
    })
    .remainingAccounts(remaining).instruction();

  return { instructions: [ix], additionalSigners: [] };
}
