import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findMultisigAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findRebateTokenAccountAddress,
  findRebateVaultAddress,
} from "../../utils";

const tp = (token22?: boolean) => (token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);

/** init_rebate_vault — admin: create the singleton rebate vault for a mint. */
export async function initRebateVault(
  program: Program,
  rebateMint: PublicKey,
  allowRebatePayout: boolean,
  opts: { admin?: PublicKey; token22?: boolean } = {},
) {
  return program.methods.initRebateVault({ allowRebatePayout })
    .accountsPartial({
      admin: opts.admin ?? program.provider.publicKey!, multisig: findMultisigAddress(program.programId)[0],
      transferAuthority: findTransferAuthorityAddress(program.programId)[0], perpetuals: findPerpetualsAddress(program.programId)[0],
      rebateMint, rebateTokenAccount: findRebateTokenAccountAddress(program.programId)[0], rebateVault: findRebateVaultAddress(program.programId)[0],
      systemProgram: SystemProgram.programId, tokenProgram: tp(opts.token22), rent: SYSVAR_RENT_PUBKEY,
    }).instruction();
}
