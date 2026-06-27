import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { findMultisigAddress, findWhitelistAddress } from "../../utils";

export interface SetWhitelistConfigParams {
  isSwapFeeExempt: boolean;
  isDepositFeeExempt: boolean;
  isWithdrawalFeeExempt: boolean;
  poolAddress: PublicKey;
}

export async function setWhitelistConfig(
  program: Program,
  owner: PublicKey,
  params: SetWhitelistConfigParams,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [whitelist] = findWhitelistAddress(owner, program.programId);

  return program.methods
    .setWhitelistConfig(params)
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      owner,
      whitelist,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}
