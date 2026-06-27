import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findPerpetualsAddress,
  findTokenVaultAddress,
  findTokenVaultTokenAccountAddress,
  findTokenStakeAddress,
  findEventAuthorityAddress,
} from "../../utils";

const tp = (token22?: boolean) => (token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);

/** deposit_token_stake — stake the governance token. */
export async function depositTokenStake(
  program: Program,
  tokenMint: PublicKey,
  fundingTokenAccount: PublicKey,
  depositAmount: BN,
  opts: { owner?: PublicKey; feePayer?: PublicKey; token22?: boolean } = {},
) {
  const owner = opts.owner ?? program.provider.publicKey!;
  return program.methods.depositTokenStake({ depositAmount })
    .accountsPartial({
      owner, feePayer: opts.feePayer ?? owner, fundingTokenAccount,
      perpetuals: findPerpetualsAddress(program.programId)[0], tokenVault: findTokenVaultAddress(program.programId)[0],
      tokenVaultTokenAccount: findTokenVaultTokenAccountAddress(program.programId)[0], tokenStakeAccount: findTokenStakeAddress(owner, program.programId)[0],
      systemProgram: SystemProgram.programId, tokenProgram: tp(opts.token22),
      eventAuthority: findEventAuthorityAddress(program.programId)[0], program: program.programId, tokenMint,
    }).instruction();
}
