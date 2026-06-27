import { Program } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import BN from "bn.js";
import {
  findBasketAddress,
  findEventAuthorityAddress,
  findPerpetualsAddress,
  findReallocVaultAddress,
} from "../../utils";
import { getReferralAccounts } from "../../utils/referral";
import { ContractOraclePrice, Privilege } from "../../types";

/**
 * Decrease a position's size (direct-ER). Send via the client's ER path on the
 * delegated basket. Custody + oracle accounts are passed explicitly (resolve
 * them from PoolConfig at the call site).
 */
export async function decreasePositionSize(
  program: Program,
  owner: PublicKey,
  pool: PublicKey,
  market: PublicKey,
  targetCustody: PublicKey,
  dispensingCustody: PublicKey,
  lockCustody: PublicKey,
  targetOracle: PublicKey,
  dispensingOracle: PublicKey,
  lockOracle: PublicKey,
  priceWithSlippage: ContractOraclePrice,
  sizeDelta: BN,
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
    .decreasePositionSizeEr({ priceWithSlippage, sizeDelta, privilege })
    .accountsPartial({
      owner,
      signer: signer ?? owner,
      sessionToken: sessionToken ?? program.programId,
      perpetuals,
      basket,
      market,
      pool,
      targetCustody,
      dispensingCustody,
      lockCustody,
      targetOracleAccount: targetOracle,
      dispensingOracleAccount: dispensingOracle,
      lockOracleAccount: lockOracle,
      reallocVault,
      eventAuthority,
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .remainingAccounts(getReferralAccounts(tokenStakeAccount, referralAccount, privilege))
    .instruction();
}
