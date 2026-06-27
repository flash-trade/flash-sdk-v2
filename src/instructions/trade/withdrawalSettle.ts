import { Program } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import {
  findEventAuthorityAddress,
  findPerpetualsAddress,
  findTradeVaultAddress,
  findTradeVaultTokenAccountAddress,
  findTransferAuthorityAddress,
  findUserDepositLedgerAddress,
  findWithdrawalEscrowReceiptAddress,
} from "../../utils";

export async function withdrawalSettle(
  program: Program,
  owner: PublicKey,
  ownerTokenAccount: PublicKey,
  tokenMint: PublicKey,
  token22 = false,
) {
  const [tradeVault] = findTradeVaultAddress(tokenMint, program.programId);
  const [tradeVaultTokenAccount] = findTradeVaultTokenAccountAddress(tokenMint, program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [withdrawalEscrowReceipt] = findWithdrawalEscrowReceiptAddress(owner, tokenMint, program.programId);
  const [userDepositLedger] = findUserDepositLedgerAddress(owner, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .withdrawalSettle()
    .accountsPartial({
      owner,
      ownerTokenAccount,
      tokenMint,
      tradeVault,
      tradeVaultTokenAccount,
      transferAuthority,
      perpetuals,
      withdrawalEscrowReceipt,
      userDepositLedger,
      tokenProgram: token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      eventAuthority,
      program: program.programId,
      escrowAuth: owner,
      escrow: owner,
    })
    .instruction();
}
