import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { DELEGATION_PROGRAM_ID } from "../../constants";
import {
  findBasketAddress,
  findDelegationSiblings,
  findEventAuthorityAddress,
  findPerpetualsAddress,
  findTradeVaultAddress,
  findTradeVaultTokenAccountAddress,
  findTransferAuthorityAddress,
  findUserDepositLedgerAddress,
  findWithdrawalEscrowReceiptAddress,
} from "../../utils";

/** withdrawal_with_action — base-layer entry; derive the escrow PDA
 *  via findWithdrawalEscrowReceiptAddress to `awaitClosed` it once the validator-driven
 *  flow finishes. */
export async function withdrawalWithAction(
  program: Program,
  owner: PublicKey,
  tokenMint: PublicKey,
  ownerTokenAccount: PublicKey,
  amount: BN,
  feePayer: PublicKey = owner,
  token22 = false,
) {
  const [tradeVault] = findTradeVaultAddress(tokenMint, program.programId);
  const [tradeVaultTokenAccount] = findTradeVaultTokenAccountAddress(tokenMint, program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [userDepositLedger] = findUserDepositLedgerAddress(owner, program.programId);
  const [withdrawalEscrowReceipt] = findWithdrawalEscrowReceiptAddress(owner, tokenMint, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);
  const sib = findDelegationSiblings(withdrawalEscrowReceipt, program.programId);

  return program.methods
    .withdrawalWithAction({
      amount,
    })
    .accountsPartial({
      owner,
      feePayer,
      ownerTokenAccount,
      tokenMint,
      tradeVault,
      tradeVaultTokenAccount,
      transferAuthority,
      perpetuals,
      basket,
      userDepositLedger,
      bufferWithdrawalEscrowReceipt: sib.buffer,
      delegationRecordWithdrawalEscrowReceipt: sib.delegationRecord,
      delegationMetadataWithdrawalEscrowReceipt: sib.delegationMetadata,
      withdrawalEscrowReceipt,
      tokenProgram: token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority,
      program: program.programId,
      ownerProgram: program.programId,
      delegationProgram: DELEGATION_PROGRAM_ID,
    })
    .instruction();
}
