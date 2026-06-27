import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findCustodyAddress,
  findEventAuthorityAddress,
  findMultisigAddress,
  findPoolAddress,
} from "../../utils";

export async function delegateCustody(
  program: Program,
  poolName: string,
  custodyMint: PublicKey,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);
  const [custody] = findCustodyAddress(pool, custodyMint, program.programId);

  return program.methods
    .delegateCustody({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      eventAuthority,
      program: program.programId,
      pool,
      custody,
    })
    .instruction();
}
