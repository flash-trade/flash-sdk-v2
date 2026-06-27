import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findPerpetualsAddress,
  findTokenVaultAddress,
  findTokenStakeAddress,
  findEventAuthorityAddress,
} from "../../utils";

/** cancel_unstake_token_request — cancel a pending unlock by request id. */
export async function cancelUnstakeTokenRequest(
  program: Program,
  withdrawRequestId: number,
  owner?: PublicKey,
) {
  const o = owner ?? program.provider.publicKey!;
  return program.methods.cancelUnstakeTokenRequest({ withdrawRequestId })
    .accountsPartial({
      owner: o, tokenVault: findTokenVaultAddress(program.programId)[0], perpetuals: findPerpetualsAddress(program.programId)[0],
      tokenStakeAccount: findTokenStakeAddress(o, program.programId)[0], eventAuthority: findEventAuthorityAddress(program.programId)[0], program: program.programId,
    }).instruction();
}
