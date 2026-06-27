import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import { findMultisigAddress, findPoolAddress, findFlpStakeAddress } from "../../utils";

/** undelegate_flp_stake — bring a single owner's flp_stake back to base. */
export async function undelegateFlpStake(
  program: Program,
  owner: PublicKey,
  poolName: string,
  admin?: PublicKey,
) {
  return program.methods.undelegateFlpStake()
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!, multisig: findMultisigAddress(program.programId)[0], owner,
      flpStakeAccount: findFlpStakeAddress(owner, findPoolAddress(poolName, program.programId)[0], program.programId)[0],
      magicProgram: MAGIC_PROGRAM_ID, magicContext: MAGIC_CONTEXT_ID,
    }).instruction();
}
