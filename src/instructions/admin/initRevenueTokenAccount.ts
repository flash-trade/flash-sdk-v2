import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findMultisigAddress,
  findPerpetualsAddress,
  findTransferAuthorityAddress,
  findTokenVaultAddress,
  findRevenueTokenAccountAddress,
  findProtocolVaultAddress,
  findProtocolTokenAccountAddress,
} from "../../utils";

const tp = (token22?: boolean) =>
  token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

export interface InitRevenueTokenAccountParams {
  feeShareBps: BN;
}

/** init_revenue_token_account — admin: create the revenue token account for a reward mint. */
export async function initRevenueTokenAccount(
  program: Program,
  params: InitRevenueTokenAccountParams,
  rewardMint: PublicKey,
  opts: { admin?: PublicKey; token22?: boolean } = {},
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [tokenVault] = findTokenVaultAddress(program.programId);
  const [revenueTokenAccount] = findRevenueTokenAccountAddress(
    program.programId,
  );
  const [protocolVault] = findProtocolVaultAddress(program.programId);
  const [protocolTokenAccount] = findProtocolTokenAccountAddress(
    program.programId,
  );

  return program.methods
    .initRevenueTokenAccount(params as any)
    .accountsPartial({
      admin: opts.admin ?? program.provider.publicKey!,
      multisig,
      transferAuthority,
      perpetuals,
      tokenVault,
      rewardMint,
      revenueTokenAccount,
      protocolVault,
      protocolTokenAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: tp(opts.token22),
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
}
