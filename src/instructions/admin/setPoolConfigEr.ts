import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findMagicFeeVaultAddress,
  findMultisigAddress,
  findPoolAddress,
  findReallocVaultAddress,
} from "../../utils";
import { Permissions } from "../../types";
import { validatorKeyForProgramId } from "../../constants";

export interface SetPoolConfigErParams {
  permissions: Permissions; maxAumUsd: BN; oracleAuthority: PublicKey; stakingFeeShareBps: BN;
  vpVolumeFactor: number; stakingFeeBoostBps: BN[]; minLpPriceUsd: BN; maxLpPriceUsd: BN; thresholdUsd: BN;
}

export async function setPoolConfigEr(
  program: Program,
  poolName: string,
  p: SetPoolConfigErParams,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [magicFeeVault] = findMagicFeeVaultAddress(validatorKeyForProgramId(program.programId));
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .setPoolConfigEr({
      permissions: p.permissions,
      oracleAuthority: p.oracleAuthority,
      maxAumUsd: p.maxAumUsd,
      stakingFeeShareBps: p.stakingFeeShareBps,
      vpVolumeFactor: p.vpVolumeFactor,
      stakingFeeBoostBps: p.stakingFeeBoostBps,
      minLpPriceUsd: p.minLpPriceUsd,
      maxLpPriceUsd: p.maxLpPriceUsd,
      thresholdUsd: p.thresholdUsd,
    })
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      pool,
      reallocVault,
      magicFeeVault,
      eventAuthority,
      program: program.programId,
    })
    .instruction();
}
