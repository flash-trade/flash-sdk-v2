import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findCustodyAddress,
  findEventAuthorityAddress,
  findMultisigAddress,
  findPoolAddress,
  findReallocVaultAddress,
} from "../../utils";
import { TokenRatios } from "../../types";

export async function addCustodyEr(
  program: Program,
  poolName: string,
  custodyTokenMint: PublicKey,
  ratios: TokenRatios[],
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);
  const [custody] = findCustodyAddress(pool, custodyTokenMint, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .addCustodyEr({ ratios })
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      pool,
      custody,
      reallocVault,
      eventAuthority,
      program: program.programId,
    })
    .instruction();
}
