import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { findMultisigAddress, findReallocVaultAddress } from "../../utils";

export async function initReallocVault(
  program: Program,
  fundingLamports: BN,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);

  return program.methods
    .initReallocVault({ fundingLamports })
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      reallocVault,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
}
