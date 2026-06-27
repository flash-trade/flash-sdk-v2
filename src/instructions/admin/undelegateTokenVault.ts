import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { findMultisigAddress, findTokenVaultAddress } from "../../utils";

/** undelegate_token_vault — admin: undelegate the token vault PDA from the ER. */
export async function undelegateTokenVault(
  program: Program,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [tokenVault] = findTokenVaultAddress(program.programId);

  return program.methods
    .undelegateTokenVault({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      tokenVault,
    })
    .instruction();
}
