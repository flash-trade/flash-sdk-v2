import { AccountMeta, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import { ro, rw } from "../../utils/remainingAccounts";
import {
  findPerpetualsAddress,
  findPoolAddress,
  findEventAuthorityAddress,
} from "../../utils";

/**
 * refresh_stake_er — permissionless keeper. Distributes accrued rewards across
 * delegated flp_stakes, commits (no undelegate). Remaining accounts are pairs
 * of (flp_stake [writable], token_stake [readonly]); pass the owner's
 * token_stake PDA per stake (a non-TokenStake account is treated as no boost).
 * SENT TO THE ER RPC (#[commit] direct-ER instruction).
 */
export async function refreshStakeEr(
  program: Program,
  poolName: string,
  rewardCustody: PublicKey,
  pairs: { flpStake: PublicKey; tokenStake: PublicKey }[],
  payer?: PublicKey,
) {
  const remaining: AccountMeta[] = [];
  for (const p of pairs) remaining.push(rw(p.flpStake), ro(p.tokenStake));

  return program.methods.refreshStakeEr()
    .accountsPartial({
      payer: payer ?? program.provider.publicKey!, perpetuals: findPerpetualsAddress(program.programId)[0], pool: findPoolAddress(poolName, program.programId)[0],
      rewardCustody, eventAuthority: findEventAuthorityAddress(program.programId)[0], program: program.programId,
      magicProgram: MAGIC_PROGRAM_ID, magicContext: MAGIC_CONTEXT_ID,
    })
    .remainingAccounts(remaining).instruction();
}
