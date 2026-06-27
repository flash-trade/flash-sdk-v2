import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findMultisigAddress,
  findReallocVaultAddress,
} from "../../utils";

export async function delegateReallocVault(
  program: Program,
  fundingLamports: BN = new BN(0),
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);

  return program.methods
    .delegateReallocVault({ fundingLamports })
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      eventAuthority,
      program: program.programId,
      reallocVault,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}
