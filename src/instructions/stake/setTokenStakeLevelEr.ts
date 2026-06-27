import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findMagicFeeVaultAddress,
  findMultisigAddress,
  findPerpetualsAddress,
  findReallocVaultAddress,
  findTokenStakeAddress,
  findTokenVaultAddress,
} from "../../utils";
import { InstructionResult } from "../../types";
import { validatorKeyForProgramId } from "../../constants";

export interface SetTokenStakeLevelErParams {
  level: number;
  rebateRate: BN;
  maxRebateUsd: BN;
}

/** set_token_stake_level_er — direct-ER admin write: set a staker's level / rebate. */
export async function buildSetTokenStakeLevelEr(
  program: Program,
  owner: PublicKey,
  params: SetTokenStakeLevelErParams,
  admin?: PublicKey,
): Promise<InstructionResult> {
  const [multisig] = findMultisigAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [tokenVault] = findTokenVaultAddress(program.programId);
  const [tokenStakeAccount] = findTokenStakeAddress(owner, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [magicFeeVault] = findMagicFeeVaultAddress(validatorKeyForProgramId(program.programId));
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  const ix = await program.methods
    .setTokenStakeLevelEr(params as any)
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      perpetuals,
      tokenVault,
      owner,
      tokenStakeAccount,
      reallocVault,
      magicFeeVault,
      eventAuthority,
      program: program.programId,
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
