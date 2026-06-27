import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findCustodyAddress,
  findEventAuthorityAddress,
  findMagicFeeVaultAddress,
  findMultisigAddress,
  findPerpetualsAddress,
  findPoolAddress,
  findReallocVaultAddress,
} from "../../utils";
import { validatorKeyForProgramId } from "../../constants";

export async function setCustodyTokenMultiplierEr(
  program: Program,
  poolName: string,
  tokenMint: PublicKey,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);
  const [custody] = findCustodyAddress(pool, tokenMint, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [magicFeeVault] = findMagicFeeVaultAddress(validatorKeyForProgramId(program.programId));
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .setCustodyTokenMultiplierEr({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      pool,
      perpetuals,
      custody,
      custodyTokenMint: tokenMint,
      reallocVault,
      magicFeeVault,
      eventAuthority,
      program: program.programId,
    })
    .instruction();
}
