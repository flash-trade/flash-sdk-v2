import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findPerpetualsAddress,
  findTransferAuthorityAddress,
  findMultisigAddress,
  findTradeVaultAddress,
  findTradeVaultTokenAccountAddress,
} from "../../utils";

/** init_trade_vault — admin-create the per-mint trade vault + its token account. */
export async function initTradeVault(
  program: Program,
  tokenMint: PublicKey,
  admin: PublicKey = program.provider.publicKey!,
  token22 = false,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [tradeVault] = findTradeVaultAddress(tokenMint, program.programId);
  const [tradeVaultTokenAccount] = findTradeVaultTokenAccountAddress(tokenMint, program.programId);

  return program.methods
    .initTradeVault()
    .accountsPartial({
      admin,
      multisig,
      perpetuals,
      transferAuthority,
      tokenMint,
      tradeVault,
      tradeVaultTokenAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
    })
    .instruction();
}
