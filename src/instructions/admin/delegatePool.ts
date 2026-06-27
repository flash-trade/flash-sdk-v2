import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findMultisigAddress,
  findPoolAddress,
} from "../../utils";

export async function delegatePool(
  program: Program,
  poolName: string,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);

  return program.methods
    .delegatePool({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      eventAuthority,
      program: program.programId,
      pool,
    })
    .instruction();
}
