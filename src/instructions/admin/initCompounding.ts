import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findMultisigAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findPoolAddress,
} from "../../utils";

/** Metaplex Token Metadata program (external, cluster-independent). */
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export interface InitCompoundingParams {
  feeShareBps: BN;
  metadataTitle: string;
  metadataSymbol: string;
  metadataUri: string;
}

/** init_compounding — one-time setup of a pool's compounding LP (creates the
 *  compounding token mint + vault + its metaplex metadata). */
export async function initCompounding(
  program: Program,
  poolName: string,
  params: InitCompoundingParams,
  admin?: PublicKey,
  opts: { token22?: boolean } = {},
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);
  const [lpTokenMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("lp_token_mint"), pool.toBuffer()],
    program.programId,
  );
  const [compoundingTokenMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("compounding_token_mint"), pool.toBuffer()],
    program.programId,
  );
  const [compoundingVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("compounding_token_account"), pool.toBuffer(), lpTokenMint.toBuffer()],
    program.programId,
  );
  const [metadataAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), compoundingTokenMint.toBuffer()],
    METADATA_PROGRAM_ID,
  );

  return program.methods
    .initCompounding(params)
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      transferAuthority,
      perpetuals,
      pool,
      lpTokenMint,
      compoundingVault,
      compoundingTokenMint,
      metadataAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: opts.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      metadataProgram: METADATA_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
}
