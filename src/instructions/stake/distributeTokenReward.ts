import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findMultisigAddress,
  findPerpetualsAddress,
  findTransferAuthorityAddress,
  findTokenVaultAddress,
  findTokenVaultTokenAccountAddress,
  findEventAuthorityAddress,
} from "../../utils";

const tp = (token22?: boolean) => (token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);

/** distribute_token_reward — admin: fund the staking reward pool. */
export async function distributeTokenReward(
  program: Program,
  tokenMint: PublicKey,
  fundingTokenAccount: PublicKey,
  amount: BN,
  epochCount: number,
  opts: { admin?: PublicKey; token22?: boolean } = {},
) {
  return program.methods.distributeTokenReward({ amount, epochCount })
    .accountsPartial({
      admin: opts.admin ?? program.provider.publicKey!, multisig: findMultisigAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0], transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      fundingTokenAccount, tokenVault: findTokenVaultAddress(program.programId)[0], tokenVaultTokenAccount: findTokenVaultTokenAccountAddress(program.programId)[0],
      tokenProgram: tp(opts.token22), eventAuthority: findEventAuthorityAddress(program.programId)[0], program: program.programId, tokenMint,
    }).instruction();
}
