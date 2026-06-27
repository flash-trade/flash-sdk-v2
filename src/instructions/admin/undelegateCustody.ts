import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findCustodyAddress,
  findMultisigAddress,
  findPoolAddress,
} from "../../utils";

export async function undelegateCustody(
  program: Program,
  poolName: string,
  custodyMint: PublicKey,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);
  const [custody] = findCustodyAddress(pool, custodyMint, program.programId);

  return program.methods
    .undelegateCustody({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      pool,
      custody,
    })
    .instruction();
}
