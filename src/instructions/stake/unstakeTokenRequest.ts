import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findPerpetualsAddress,
  findTokenVaultAddress,
  findTokenStakeAddress,
  findEventAuthorityAddress,
} from "../../utils";

/** unstake_token_request — begin an unlock (cooldown handled on-chain). */
export async function unstakeTokenRequest(
  program: Program,
  unstakeAmount: BN,
  owner?: PublicKey,
) {
  const o = owner ?? program.provider.publicKey!;
  return program.methods.unstakeTokenRequest({ unstakeAmount })
    .accountsPartial({
      owner: o, tokenVault: findTokenVaultAddress(program.programId)[0], perpetuals: findPerpetualsAddress(program.programId)[0],
      tokenStakeAccount: findTokenStakeAddress(o, program.programId)[0], eventAuthority: findEventAuthorityAddress(program.programId)[0], program: program.programId,
    }).instruction();
}
