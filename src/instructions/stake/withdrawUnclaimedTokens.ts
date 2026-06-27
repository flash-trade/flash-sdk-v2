import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findMultisigAddress,
  findPerpetualsAddress,
  findTransferAuthorityAddress,
  findTokenVaultAddress,
  findTokenVaultTokenAccountAddress,
} from "../../utils";

const tp = (token22?: boolean) => (token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);

/** withdraw_unclaimed_tokens — admin: sweep unclaimed staking tokens. */
export async function withdrawUnclaimedTokens(
  program: Program,
  receivingTokenMint: PublicKey,
  receivingTokenAccount: PublicKey,
  opts: { admin?: PublicKey; token22?: boolean } = {},
) {
  // WithdrawUnclaimedTokensParams is an empty struct → pass {}.
  return program.methods.withdrawUnclaimedTokens({})
    .accountsPartial({
      admin: opts.admin ?? program.provider.publicKey!, multisig: findMultisigAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0], transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      tokenVault: findTokenVaultAddress(program.programId)[0], tokenVaultTokenAccount: findTokenVaultTokenAccountAddress(program.programId)[0],
      receivingTokenAccount, tokenProgram: tp(opts.token22), receivingTokenMint,
    }).instruction();
}
