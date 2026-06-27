import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { findMultisigAddress, findWhitelistAddress } from "../../utils";

export interface CreateWhitelistParams {
  isSwapFeeExempt: boolean;
  isDepositFeeExempt: boolean;
  isWithdrawalFeeExempt: boolean;
  poolAddress: PublicKey;
}

export async function createWhitelist(
  program: Program,
  owner: PublicKey,
  params: CreateWhitelistParams,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [whitelist] = findWhitelistAddress(owner, program.programId);

  return program.methods
    .createWhitelist(params)
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      owner,
      whitelist,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}
