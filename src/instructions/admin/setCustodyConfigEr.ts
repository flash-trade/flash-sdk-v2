import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import {
  findCustodyAddress,
  findEventAuthorityAddress,
  findMagicFeeVaultAddress,
  findMultisigAddress,
  findPerpetualsAddress,
  findPoolAddress,
  findReallocVaultAddress,
} from "../../utils";
import { BorrowRateParams, Fees, Permissions, TokenRatios } from "../../types";
import { validatorKeyForProgramId } from "../../constants";

export interface SetCustodyConfigErParams {
  isVirtual: boolean; depegAdjustment: boolean; inversePrice: boolean; oracle: any; pricing: any;
  permissions: Permissions; fees: Fees; borrowRate: BorrowRateParams; ratios: TokenRatios[];
  minReserveUsd: BN; limitPriceBufferBps: BN; token22: boolean;
}

export async function setCustodyConfigEr(
  program: Program,
  poolName: string,
  tokenMint: PublicKey,
  params: SetCustodyConfigErParams,
  custodyOracleAccount: PublicKey,
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
    .setCustodyConfigEr(params as any)
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      pool,
      perpetuals,
      custody,
      custodyOracleAccount,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      reallocVault,
      magicFeeVault,
      eventAuthority,
      program: program.programId,
    })
    .instruction();
}
