import { Program } from "@coral-xyz/anchor";
import { AccountMeta, PublicKey } from "@solana/web3.js";
import { rw } from "../../utils/remainingAccounts";
import {
  findPerpetualsAddress,
  findTokenVaultAddress,
  findEventAuthorityAddress,
} from "../../utils";

/** refresh_token_stake — keeper: refresh a batch of token_stake accounts.
 *  Remaining accounts = the token_stake PDAs to refresh (writable). */
export async function refreshTokenStake(
  program: Program,
  tokenStakeAccounts: PublicKey[],
) {
  const remaining: AccountMeta[] = tokenStakeAccounts.map(rw);
  return program.methods.refreshTokenStake({})
    .accountsPartial({
      perpetuals: findPerpetualsAddress(program.programId)[0], tokenVault: findTokenVaultAddress(program.programId)[0],
      eventAuthority: findEventAuthorityAddress(program.programId)[0], program: program.programId,
    })
    .remainingAccounts(remaining).instruction();
}
