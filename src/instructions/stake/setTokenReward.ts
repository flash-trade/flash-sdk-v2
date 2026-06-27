import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findMultisigAddress,
  findTokenVaultAddress,
  findTokenStakeAddress,
  findEventAuthorityAddress,
} from "../../utils";

/** set_token_reward — admin: set the reward schedule for a staker. */
export async function setTokenReward(
  program: Program,
  owner: PublicKey,
  amount: BN,
  epochCount: number,
  admin?: PublicKey,
) {
  return program.methods.setTokenReward({ amount, epochCount })
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!, multisig: findMultisigAddress(program.programId)[0],
      tokenVault: findTokenVaultAddress(program.programId)[0], tokenStakeAccount: findTokenStakeAddress(owner, program.programId)[0],
      eventAuthority: findEventAuthorityAddress(program.programId)[0], program: program.programId,
    }).instruction();
}
