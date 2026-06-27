import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findMultisigAddress,
  findTokenVaultAddress,
} from "../../utils";

/** delegate_token_vault — admin: delegate the token vault PDA to the ER validator. */
export async function delegateTokenVault(
  program: Program,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);
  const [tokenVault] = findTokenVaultAddress(program.programId);

  return program.methods
    .delegateTokenVault({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      eventAuthority,
      program: program.programId,
      tokenVault,
    })
    .instruction();
}
