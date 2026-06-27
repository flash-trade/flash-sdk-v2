import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findPerpetualsAddress,
  findTransferAuthorityAddress,
  findTokenVaultAddress,
  findTokenVaultTokenAccountAddress,
  findTokenStakeAddress,
  findEventAuthorityAddress,
} from "../../utils";

const tp = (token22?: boolean) => (token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);

/** collect_token_reward — claim accrued staking rewards. */
export async function collectTokenReward(
  program: Program,
  tokenMint: PublicKey,
  receivingTokenAccount: PublicKey,
  opts: { owner?: PublicKey; token22?: boolean } = {},
) {
  const owner = opts.owner ?? program.provider.publicKey!;
  // CollectTokenRewardParams is an empty struct → pass {}.
  return program.methods.collectTokenReward({})
    .accountsPartial({
      owner, receivingTokenAccount, perpetuals: findPerpetualsAddress(program.programId)[0],
      transferAuthority: findTransferAuthorityAddress(program.programId)[0], tokenVault: findTokenVaultAddress(program.programId)[0],
      tokenVaultTokenAccount: findTokenVaultTokenAccountAddress(program.programId)[0], tokenStakeAccount: findTokenStakeAddress(owner, program.programId)[0],
      tokenProgram: tp(opts.token22), eventAuthority: findEventAuthorityAddress(program.programId)[0], program: program.programId, tokenMint,
    }).instruction();
}
