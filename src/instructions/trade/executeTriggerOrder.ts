import { Program } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import {
  findBasketAddress,
  findEventAuthorityAddress,
  findPerpetualsAddress,
  findReallocVaultAddress,
  findUserDepositLedgerAddress,
} from "../../utils";
import { getReferralAccounts } from "../../utils/referral";
import { Privilege } from "../../types";

/**
 * execute_trigger_order_er — keeper fires a TP/SL (direct-ER). Custody + oracle
 * accounts are passed explicitly (resolve them from PoolConfig at the call site).
 */
export async function executeTriggerOrder(
  program: Program,
  owner: PublicKey,
  pool: PublicKey,
  market: PublicKey,
  targetCustody: PublicKey,
  lockCustody: PublicKey,
  dispensingCustody: PublicKey,
  targetOracle: PublicKey,
  lockOracle: PublicKey,
  dispensingOracle: PublicKey,
  orderId: number,
  isStopLoss: boolean,
  keeper?: PublicKey,
  privilege: Privilege = Privilege.None,
  referralAccount: PublicKey = PublicKey.default,
  tokenStakeAccount: PublicKey = PublicKey.default,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [userDepositLedger] = findUserDepositLedgerAddress(owner, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .executeTriggerOrderEr({ isStopLoss, orderId, privilege })
    .accountsPartial({
      keeper: keeper ?? program.provider.publicKey!,
      perpetuals,
      basket,
      userDepositLedger,
      pool,
      market,
      targetCustody,
      lockCustody,
      dispensingCustody,
      targetOracleAccount: targetOracle,
      lockOracleAccount: lockOracle,
      dispensingOracleAccount: dispensingOracle,
      reallocVault,
      eventAuthority,
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .remainingAccounts(getReferralAccounts(tokenStakeAccount, referralAccount, privilege))
    .instruction();
}
