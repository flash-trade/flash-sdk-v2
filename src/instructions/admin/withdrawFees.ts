import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findMultisigAddress,
  findPerpetualsAddress,
  findProtocolTokenAccountAddress,
  findProtocolVaultAddress,
  findTransferAuthorityAddress,
} from "../../utils";

// withdraw_fees: admin moves accumulated protocol fees from the protocol vault's
// token account into an arbitrary receiving token account.
export async function withdrawFees(
  program: Program,
  receivingMint: PublicKey,
  receivingTokenAccount: PublicKey,
  admin?: PublicKey,
  opts: { token22?: boolean } = {},
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [protocolVault] = findProtocolVaultAddress(program.programId);
  const [protocolTokenAccount] = findProtocolTokenAccountAddress(program.programId);

  return program.methods
    .withdrawFees({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      transferAuthority,
      perpetuals,
      protocolVault,
      protocolTokenAccount,
      receivingTokenAccount,
      tokenProgram: opts.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      receivingMint,
    })
    .instruction();
}
