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
 * execute_limit_order_er — keeper fills a resting limit order (direct-ER).
 * Custody + oracle accounts are passed explicitly (resolve them from PoolConfig
 * at the call site).
 */
export async function executeLimitOrder(
  program: Program,
  owner: PublicKey,
  pool: PublicKey,
  market: PublicKey,
  targetCustody: PublicKey,
  lockCustody: PublicKey,
  reserveCustody: PublicKey,
  targetOracle: PublicKey,
  reserveOracle: PublicKey,
  lockOracle: PublicKey,
  orderId: number,
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
    .executeLimitOrderEr({ orderId, privilege })
    .accountsPartial({
      keeper: keeper ?? program.provider.publicKey!,
      perpetuals,
      basket,
      userDepositLedger,
      pool,
      market,
      targetCustody,
      lockCustody,
      reserveCustody,
      targetOracleAccount: targetOracle,
      reserveOracleAccount: reserveOracle,
      lockOracleAccount: lockOracle,
      reallocVault,
      eventAuthority,
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .remainingAccounts(getReferralAccounts(tokenStakeAccount, referralAccount, privilege))
    .instruction();
}
