import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DELEGATION_PROGRAM_ID } from "../../constants";
import {
  findCustodySettlementReceiptAddress,
  findCustodyTokenAccountAddress,
  findDelegationSiblings,
  findEventAuthorityAddress,
  findPerpetualsAddress,
  findTradeVaultAddress,
  findTradeVaultTokenAccountAddress,
  findTransferAuthorityAddress,
} from "../../utils";

/** custody_settlement_with_action — keeper op per custody; nets trade
 *  PnL between the custody and the trade vault. Derive the receipt PDA via
 *  findCustodySettlementReceiptAddress. */
export async function custodySettlementWithAction(
  program: Program,
  pool: PublicKey,
  custody: PublicKey,
  tokenMint: PublicKey,
  payer: PublicKey = program.provider.publicKey!,
  token22 = false,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [tradeVault] = findTradeVaultAddress(tokenMint, program.programId);
  const [tradeVaultTokenAccount] = findTradeVaultTokenAccountAddress(tokenMint, program.programId);
  const [custodyTokenAccount] = findCustodyTokenAccountAddress(pool, tokenMint, program.programId);
  const [settlementReceipt] = findCustodySettlementReceiptAddress(custody, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);
  const sib = findDelegationSiblings(settlementReceipt, program.programId);

  return program.methods
    .custodySettlementWithAction({})
    .accountsPartial({
      payer,
      pool,
      custody,
      perpetuals,
      transferAuthority,
      tokenMint,
      tradeVault,
      tradeVaultTokenAccount,
      custodyTokenAccount,
      bufferSettlementReceipt: sib.buffer,
      delegationRecordSettlementReceipt: sib.delegationRecord,
      delegationMetadataSettlementReceipt: sib.delegationMetadata,
      settlementReceipt,
      tokenProgram: token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority,
      program: program.programId,
      ownerProgram: program.programId,
      delegationProgram: DELEGATION_PROGRAM_ID,
    })
    .instruction();
}
