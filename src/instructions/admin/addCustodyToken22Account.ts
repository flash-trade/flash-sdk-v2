import { BN, Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  findCustodyTokenAccountAddress,
  findMultisigAddress,
  findPerpetualsAddress,
  findPoolAddress,
  findTransferAuthorityAddress,
} from "../../utils";

export interface AddCustodyToken22AccountParams {
  tokenAccountSpace: BN;
}

export async function addCustodyToken22Account(
  program: Program,
  poolName: string,
  custodyTokenMint: PublicKey,
  params: AddCustodyToken22AccountParams,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);
  const [custodyTokenAccount] = findCustodyTokenAccountAddress(
    pool,
    custodyTokenMint,
    program.programId,
  );

  return program.methods
    .addCustodyToken22Account(params)
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      transferAuthority,
      perpetuals,
      pool,
      custodyTokenAccount,
      custodyTokenMint,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
}
