import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findMagicFeeVaultAddress,
  findMultisigAddress,
  findReallocVaultAddress,
  findTokenVaultAddress,
} from "../../utils";
import { InstructionResult } from "../../types";
import { validatorKeyForProgramId } from "../../constants";

export interface SetTokenVaultConfigErParams {
  tokenPermissions: any;
  withdrawTimeLimit: BN;
  withdrawInstantFee: BN;
  stakeLevel: BN[];
  unlockPeriod: BN;
  allowRevenueDistribution: number;
}

/** set_token_vault_config_er — direct-ER admin write to the delegated token vault. */
export async function buildSetTokenVaultConfigEr(
  program: Program,
  params: SetTokenVaultConfigErParams,
  admin?: PublicKey,
): Promise<InstructionResult> {
  const [multisig] = findMultisigAddress(program.programId);
  const [tokenVault] = findTokenVaultAddress(program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [magicFeeVault] = findMagicFeeVaultAddress(validatorKeyForProgramId(program.programId));
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  const ix = await program.methods
    .setTokenVaultConfigEr(params as any)
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      tokenVault,
      reallocVault,
      magicFeeVault,
      eventAuthority,
      program: program.programId,
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
