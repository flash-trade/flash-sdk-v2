import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { InstructionResult } from "../../types";
import { delegatedAccountFragment, sharedDelegationAccounts } from "../../utils/delegation";
import { findTokenStakeAddress, findEventAuthorityAddress } from "../../utils";

export interface InitDelegateTokenStakeArgs {
  /** Owner of the token_stake. Does NOT sign — only seeds the PDA. */
  owner: PublicKey;
  /** Funds rent + delegation and is the sole signer. Defaults to the provider. */
  payer?: PublicKey;
}

/** init_delegate_token_stake — create + delegate a single per-user `token_stake`
 *  to the ER with no token movement and a non-signing `owner`. Strict: reverts if
 *  the stake already exists. The `payer` (provider by default) signs and funds. */
export async function buildInitDelegateTokenStake(
  program: Program,
  args: InitDelegateTokenStakeArgs,
): Promise<InstructionResult> {
  const payer = args.payer ?? program.provider.publicKey!;
  const tokenStakeAccount = findTokenStakeAddress(args.owner, program.programId)[0];

  const ix = await program.methods
    .initDelegateTokenStake()
    .accountsPartial({
      payer,
      owner: args.owner,
      ...delegatedAccountFragment(program.programId, "tokenStakeAccount", tokenStakeAccount),
      systemProgram: SystemProgram.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      ...sharedDelegationAccounts(program.programId),
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
