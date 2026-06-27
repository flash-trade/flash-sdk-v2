import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findMultisigAddress,
  findRebateVaultAddress,
} from "../../utils";

/** delegate_rebate_vault — admin: delegate the rebate vault PDA to the ER validator. */
export async function delegateRebateVault(
  program: Program,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);
  const [rebateVault] = findRebateVaultAddress(program.programId);

  return program.methods
    .delegateRebateVault({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      eventAuthority,
      program: program.programId,
      rebateVault,
    })
    .instruction();
}
