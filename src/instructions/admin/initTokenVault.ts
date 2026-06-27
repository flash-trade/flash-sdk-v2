import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findMultisigAddress,
  findPerpetualsAddress,
  findTransferAuthorityAddress,
  findTokenVaultAddress,
  findTokenVaultTokenAccountAddress,
} from "../../utils";

const tp = (token22?: boolean) =>
  token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

export interface InitTokenVaultParams {
  tokenPermissions: any;
  amount: BN;
  withdrawTimeLimit: BN;
  withdrawInstantFee: BN;
  stakeLevel: BN[];
}

/** init_token_vault — admin: create the singleton token (trade) vault for a mint. */
export async function initTokenVault(
  program: Program,
  params: InitTokenVaultParams,
  tokenMint: PublicKey,
  fundingTokenAccount: PublicKey,
  opts: { admin?: PublicKey; token22?: boolean } = {},
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [tokenVault] = findTokenVaultAddress(program.programId);
  const [tokenVaultTokenAccount] = findTokenVaultTokenAccountAddress(
    program.programId,
  );

  return program.methods
    .initTokenVault(params as any)
    .accountsPartial({
      admin: opts.admin ?? program.provider.publicKey!,
      multisig,
      perpetuals,
      transferAuthority,
      fundingTokenAccount,
      tokenMint,
      tokenVault,
      tokenVaultTokenAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: tp(opts.token22),
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
}
