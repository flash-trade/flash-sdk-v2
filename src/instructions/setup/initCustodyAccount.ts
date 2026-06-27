import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findCustodyAddress,
  findCustodyTokenAccountAddress,
  findMultisigAddress,
  findPerpetualsAddress,
  findPoolAddress,
  findTransferAuthorityAddress,
} from "../../utils";
import { BorrowRateParams, Fees, Permissions } from "../../types";

export interface InitCustodyParams {
  isStable: boolean; depegAdjustment: boolean; isVirtual: boolean; inversePrice: boolean;
  token22: boolean; oracle: any; pricing: any; permissions: Permissions; fees: Fees;
  borrowRate: BorrowRateParams; tokenAmountMultiplier: BN; minReserveUsd: BN; limitPriceBufferBps: BN; uid: number;
}

export async function initCustodyAccount(
  program: Program,
  poolName: string,
  custodyTokenMint: PublicKey,
  params: InitCustodyParams,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [pool, poolBump] = findPoolAddress(poolName, program.programId);
  const [custody] = findCustodyAddress(pool, custodyTokenMint, program.programId);
  const [custodyTokenAccount] = findCustodyTokenAccountAddress(pool, custodyTokenMint, program.programId);

  return program.methods
    .initCustodyAccount({ poolName, poolBump, ...params })
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      transferAuthority,
      perpetuals,
      pool,
      custody,
      custodyTokenAccount,
      custodyTokenMint,
      systemProgram: SystemProgram.programId,
      tokenProgram: params.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
}
