import { BN, Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findMultisigAddress,
  findPerpetualsAddress,
  findPoolAddress,
  findTransferAuthorityAddress,
} from "../../utils";
import { Permissions } from "../../types";

const METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);

export interface AddPoolParams {
  name: string;
  permissions: Permissions;
  maxAumUsd: BN;
  metadataTitle: string;
  metadataSymbol: string;
  metadataUri: string;
  stakingFeeShareBps: BN;
  vpVolumeFactor: number;
  stakingFeeBoostBps: BN[];
  minLpPriceUsd: BN;
  maxLpPriceUsd: BN;
  thresholdUsd: BN;
}

export async function addPool(
  program: Program,
  poolName: string,
  params: Omit<AddPoolParams, "name">,
  oracleAuthority: PublicKey,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);
  const [lpTokenMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("lp_token_mint"), pool.toBuffer()],
    program.programId,
  );
  const [metadataAccount] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      METADATA_PROGRAM_ID.toBuffer(),
      lpTokenMint.toBuffer(),
    ],
    METADATA_PROGRAM_ID,
  );

  return program.methods
    .addPool({ name: poolName, ...params })
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      oracleAuthority,
      multisig,
      transferAuthority,
      perpetuals,
      pool,
      lpTokenMint,
      metadataAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      metadataProgram: METADATA_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
}
