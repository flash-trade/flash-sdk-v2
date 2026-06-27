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
 * Increase a position's size (direct-ER). Send via the client's ER path on the
 * delegated basket. Custody + oracle accounts are passed explicitly (resolve
 * them from PoolConfig at the call site).
 */
export async function increasePositionSize(
  program: Program,
  owner: PublicKey,
  pool: PublicKey,
  market: PublicKey,
  targetCustody: PublicKey,
  receivingCustody: PublicKey,
  lockCustody: PublicKey,
  targetOracle: PublicKey,
  receivingOracle: PublicKey,
  lockOracle: PublicKey,
  priceWithSlippage: ContractOraclePrice,
  sizeDelta: BN,
  deltaCollateralAmount: BN,
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
    .increasePositionSizeEr({ priceWithSlippage, sizeDelta, deltaCollateralAmount, privilege })
    .accountsPartial({
      owner,
      signer: signer ?? owner,
      sessionToken: sessionToken ?? program.programId,
      perpetuals,
      basket,
      userDepositLedger,
      market,
      pool,
      targetCustody,
      receivingCustody,
      lockCustody,
      targetOracleAccount: targetOracle,
      receivingOracleAccount: receivingOracle,
      lockOracleAccount: lockOracle,
      reallocVault,
      eventAuthority,
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .remainingAccounts(getReferralAccounts(tokenStakeAccount, referralAccount, privilege))
    .instruction();
}
