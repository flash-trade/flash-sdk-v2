import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { findMultisigAddress, findRebateVaultAddress } from "../../utils";

/** undelegate_rebate_vault — admin: undelegate the rebate vault PDA from the ER. */
export async function undelegateRebateVault(
  program: Program,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [rebateVault] = findRebateVaultAddress(program.programId);

  return program.methods
    .undelegateRebateVault({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      rebateVault,
    })
    .instruction();
}
