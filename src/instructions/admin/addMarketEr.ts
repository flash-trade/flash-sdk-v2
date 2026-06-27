import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findMarketAddress,
  findMultisigAddress,
  findPoolAddress,
  findReallocVaultAddress,
} from "../../utils";
import { Side } from "../../types";

export async function addMarketEr(
  program: Program,
  poolName: string,
  targetCustody: PublicKey,
  collateralCustody: PublicKey,
  side: Side,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);
  const [market] = findMarketAddress(targetCustody, collateralCustody, side, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .addMarketEr({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      pool,
      targetCustody,
      collateralCustody,
      market,
      reallocVault,
      eventAuthority,
      program: program.programId,
    })
    .instruction();
}
