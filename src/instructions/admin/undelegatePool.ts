import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { findMultisigAddress, findPoolAddress } from "../../utils";

export async function undelegatePool(
  program: Program,
  poolName: string,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);

  return program.methods
    .undelegatePool({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      pool,
    })
    .instruction();
}
