import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { findTokenStakeAddress, findReferralAddress } from "../../utils";

/** create_referral — link `owner` to a referrer (by the referrer's token stake). */
export async function createReferral(
  program: Program,
  referrer: PublicKey,
  opts: { owner?: PublicKey; feePayer?: PublicKey } = {},
) {
  const owner = opts.owner ?? program.provider.publicKey!;
  // CreateReferralParams is an empty struct → pass {}.
  return program.methods.createReferral({})
    .accountsPartial({
      owner, feePayer: opts.feePayer ?? owner,
      tokenStakeAccount: findTokenStakeAddress(referrer, program.programId)[0], // referrer's token stake
      referralAccount: findReferralAddress(owner, program.programId)[0],
      systemProgram: SystemProgram.programId,
    }).instruction();
}
