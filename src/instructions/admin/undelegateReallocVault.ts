import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { findMultisigAddress, findReallocVaultAddress } from "../../utils";

export async function undelegateReallocVault(
  program: Program,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);

  return program.methods
    .undelegateReallocVault({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      reallocVault,
    })
    .instruction();
}
