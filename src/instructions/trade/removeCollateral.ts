import { Program } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import BN from "bn.js";
import {
  findBasketAddress,
  findEventAuthorityAddress,
  findPerpetualsAddress,
  findReallocVaultAddress,
} from "../../utils";

/**
 * Remove collateral from a position (direct-ER). Send via the client's ER path
 * on the delegated basket. Custody + oracle accounts are passed explicitly
 * (resolve them from PoolConfig at the call site).
 */
export async function removeCollateral(
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
  collateralDeltaUsd: BN,
  signer?: PublicKey,
  sessionToken?: PublicKey | null,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .removeCollateralEr({ collateralDeltaUsd })
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
    .instruction();
}
