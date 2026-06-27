import { Program } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import {
  findCustodySettlementReceiptAddress,
  findCustodyTokenAccountAddress,
  findEventAuthorityAddress,
  findPerpetualsAddress,
  findTradeVaultAddress,
  findTradeVaultTokenAccountAddress,
  findTransferAuthorityAddress,
} from "../../utils";

export async function custodySettlementSettle(
  program: Program,
  payer: PublicKey,
  pool: PublicKey,
  custody: PublicKey,
  tokenMint: PublicKey,
  token22 = false,
) {
  const [tradeVault] = findTradeVaultAddress(tokenMint, program.programId);
  const [tradeVaultTokenAccount] = findTradeVaultTokenAccountAddress(tokenMint, program.programId);
  const [custodyTokenAccount] = findCustodyTokenAccountAddress(pool, tokenMint, program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [settlementReceipt] = findCustodySettlementReceiptAddress(custody, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .custodySettlementSettle()
    .accountsPartial({
      payer,
      pool,
      custody,
      tradeVault,
      tradeVaultTokenAccount,
      custodyTokenAccount,
      tokenMint,
      transferAuthority,
      perpetuals,
      settlementReceipt,
      tokenProgram: token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      eventAuthority,
      program: program.programId,
      escrowAuth: payer,
      escrow: payer,
    })
    .instruction();
}
