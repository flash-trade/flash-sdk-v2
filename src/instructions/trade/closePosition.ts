import { Program } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import {
  findBasketAddress,
  findEventAuthorityAddress,
  findPerpetualsAddress,
  findReallocVaultAddress,
} from "../../utils";
import { getReferralAccounts } from "../../utils/referral";
import { ContractOraclePrice, Privilege } from "../../types";

/**
 * Close a position (direct-ER). Send via the client's ER path on the delegated
 * basket. Custody + oracle accounts are passed explicitly (resolve them from
 * PoolConfig at the call site).
 */
export async function closePosition(
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
  priceWithSlippage: ContractOraclePrice,
  privilege: Privilege = Privilege.None,
  signer?: PublicKey,
  sessionToken?: PublicKey | null,
  referralAccount: PublicKey = PublicKey.default,
  tokenStakeAccount: PublicKey = PublicKey.default,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .closePositionEr({ priceWithSlippage, privilege })
    .accountsPartial({
      owner,
      signer: signer ?? owner,
      sessionToken: sessionToken ?? program.programId,
      perpetuals,
      basket,
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
