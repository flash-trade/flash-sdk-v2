import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID, validatorKeyForProgramId } from "../../constants";
import {
  findPerpetualsAddress,
  findTokenVaultAddress,
  findTokenStakeAddress,
  findEventAuthorityAddress,
  findMagicFeeVaultAddress,
  findReallocVaultAddress,
} from "../../utils";

/**
 * unstake_token_request_er — begin an unlock on the ER (cooldown handled
 * on-chain). The token_stake account is delegated; sent to the ER RPC
 * (#[commit] direct-ER instruction). Mirrors `unstake_token_request`.
 */
export async function unstakeTokenRequestEr(
  program: Program,
  unstakeAmount: BN,
  owner?: PublicKey,
) {
  const o = owner ?? program.provider.publicKey!;
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [magicFeeVault] = findMagicFeeVaultAddress(validatorKeyForProgramId(program.programId));
  return program.methods
    .unstakeTokenRequestEr({ unstakeAmount })
    .accountsPartial({
      owner: o,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      tokenVault: findTokenVaultAddress(program.programId)[0],
      tokenStakeAccount: findTokenStakeAddress(o, program.programId)[0],
      reallocVault,
      magicFeeVault,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      magicProgram: MAGIC_PROGRAM_ID,
      magicContext: MAGIC_CONTEXT_ID,
    })
    .instruction();
}
