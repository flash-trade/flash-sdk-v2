import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import { findMultisigAddress, findTokenStakeAddress } from "../../utils";

/** undelegate_token_stake — bring a single owner's token_stake back to base. */
export async function undelegateTokenStake(
  program: Program,
  owner: PublicKey,
  admin?: PublicKey,
) {
  return program.methods.undelegateTokenStake()
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig: findMultisigAddress(program.programId)[0],
      owner,
      tokenStakeAccount: findTokenStakeAddress(owner, program.programId)[0],
      magicProgram: MAGIC_PROGRAM_ID,
      magicContext: MAGIC_CONTEXT_ID,
    }).instruction();
}
