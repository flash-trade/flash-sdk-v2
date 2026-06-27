import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  findMultisigAddress,
  findPerpetualsAddress,
  findTokenVaultAddress,
  findTokenStakeAddress,
} from "../../utils";

/** set_token_stake_level — admin: set a staker's level / rebate rate. */
export async function setTokenStakeLevel(
  program: Program,
  owner: PublicKey,
  params: { level: number; rebateRate: BN; maxRebateUsd: BN },
  admin?: PublicKey,
) {
  return program.methods.setTokenStakeLevel(params)
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!, multisig: findMultisigAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0], tokenVault: findTokenVaultAddress(program.programId)[0], owner,
      tokenStakeAccount: findTokenStakeAddress(owner, program.programId)[0], systemProgram: SystemProgram.programId,
    }).instruction();
}
