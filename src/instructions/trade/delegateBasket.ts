import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { DELEGATION_PROGRAM_ID } from "../../constants";
import {
  findBasketAddress,
  findDelegationSiblings,
  findEventAuthorityAddress,
} from "../../utils";

/** delegate_basket — delegate a basket to the ER so direct-ER trades can run. */
export async function delegateBasket(
  program: Program,
  owner: PublicKey,
  payer: PublicKey = program.provider.publicKey!,
) {
  const [basket] = findBasketAddress(owner, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);
  const sib = findDelegationSiblings(basket, program.programId);

  return program.methods
    .delegateBasket({})
    .accountsPartial({
      payer,
      owner,
      bufferBasket: sib.buffer,
      delegationRecordBasket: sib.delegationRecord,
      delegationMetadataBasket: sib.delegationMetadata,
      basket,
      eventAuthority,
      program: program.programId,
      ownerProgram: program.programId,
      delegationProgram: DELEGATION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}
