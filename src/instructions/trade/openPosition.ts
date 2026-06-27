import { Program } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import BN from "bn.js";
import {
  findBasketAddress,
  findEventAuthorityAddress,
  findPerpetualsAddress,
  findReallocVaultAddress,
  findUserDepositLedgerAddress,
} from "../../utils";
import { getReferralAccounts } from "../../utils/referral";
import { ContractOraclePrice, Privilege } from "../../types";

/**
 * Open a position (direct-ER). Send via the client's ER path on the delegated
 * basket. Custody + oracle accounts are passed explicitly (resolve them from
 * PoolConfig at the call site).
 *
 * Referral / token-stake benefits: pass a non-None `privilege` plus the
 * `referralAccount` / `tokenStakeAccount` to append the fee-discount tail.
 */
export async function openPosition(
  program: Program,
  owner: PublicKey,
  pool: PublicKey,
  market: PublicKey,
  targetCustody: PublicKey,
  lockCustody: PublicKey,
  receivingCustody: PublicKey,
  targetOracle: PublicKey,
  lockOracle: PublicKey,
  receivingOracle: PublicKey,
  priceWithSlippage: ContractOraclePrice,
  collateralAmount: BN,
  sizeAmount: BN,
  privilege: Privilege = Privilege.None,
  signer?: PublicKey,
  sessionToken?: PublicKey | null,
  referralAccount: PublicKey = PublicKey.default,
  tokenStakeAccount: PublicKey = PublicKey.default,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [userDepositLedger] = findUserDepositLedgerAddress(owner, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .openPositionEr({ priceWithSlippage, collateralAmount, sizeAmount, privilege })
    .accountsPartial({
      owner,
      signer: signer ?? owner,
      sessionToken: sessionToken ?? program.programId,
      perpetuals,
      basket,
      userDepositLedger,
      pool,
      market,
      targetCustody,
      lockCustody,
      receivingCustody,
      targetOracleAccount: targetOracle,
      lockOracleAccount: lockOracle,
      receivingOracleAccount: receivingOracle,
      reallocVault,
      eventAuthority,
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .remainingAccounts(getReferralAccounts(tokenStakeAccount, referralAccount, privilege))
    .instruction();
}
