import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findMultisigAddress,
  findOrderAddress,
} from "../../utils";

/** close_legacy_order_account_er — admin close for migrated/empty legacy order PDAs. */
export async function closeLegacyOrderAccount(
  program: Program,
  owner: PublicKey,
  market: PublicKey,
  admin: PublicKey = program.provider.publicKey!,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [order] = findOrderAddress(owner, market, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .closeLegacyOrderAccountEr({})
    .accountsPartial({
      admin,
      multisig,
      owner,
      market,
      order,
      systemProgram: SystemProgram.programId,
      eventAuthority,
      program: program.programId,
      escrowAuth: admin,
      escrow: admin,
    })
    .instruction();
}
