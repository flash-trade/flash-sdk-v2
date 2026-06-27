import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findMultisigAddress,
  findPositionAddress,
} from "../../utils";

/** close_legacy_position_account_er — admin close for migrated/empty legacy position PDAs. */
export async function closeLegacyPositionAccount(
  program: Program,
  owner: PublicKey,
  market: PublicKey,
  admin: PublicKey = program.provider.publicKey!,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [position] = findPositionAddress(owner, market, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .closeLegacyPositionAccountEr({})
    .accountsPartial({
      admin,
      multisig,
      owner,
      market,
      position,
      systemProgram: SystemProgram.programId,
      eventAuthority,
      program: program.programId,
      escrowAuth: admin,
      escrow: admin,
    })
    .instruction();
}
