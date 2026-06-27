import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findPerpetualsAddress,
  findTokenVaultAddress,
} from "../../utils";
import { rw } from "../../utils/remainingAccounts";
import { InstructionResult } from "../../types";

/** refresh_token_stake_er — direct-ER write to refresh the delegated token vault.
 *  The handler iterates `remaining_accounts` as the delegated `token_stake`
 *  accounts to refresh (mutable, unsigned) — pass at least one or the ix is a
 *  no-op. */
export async function buildRefreshTokenStakeEr(
  program: Program,
  tokenStakes: PublicKey[],
  payer?: PublicKey,
): Promise<InstructionResult> {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [tokenVault] = findTokenVaultAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  const ix = await program.methods
    .refreshTokenStakeEr()
    .accountsPartial({
      payer: payer ?? program.provider.publicKey!,
      perpetuals,
      tokenVault,
      eventAuthority,
      program: program.programId,
    })
    .remainingAccounts(tokenStakes.map(rw))
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
