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
import { ContractOraclePrice } from "../../types";

/**
 * Place a resting limit order (direct-ER). Custody + oracle accounts are passed
 * explicitly (resolve them from PoolConfig at the call site).
 */
export async function placeLimitOrder(
  program: Program,
  owner: PublicKey,
  pool: PublicKey,
  market: PublicKey,
  targetCustody: PublicKey,
  lockCustody: PublicKey,
  reserveCustody: PublicKey,
  receiveCustody: PublicKey,
  targetOracle: PublicKey,
  reserveOracle: PublicKey,
  limitPrice: ContractOraclePrice,
  reserveAmount: BN,
  sizeAmount: BN,
  stopLossPrice: ContractOraclePrice,
  takeProfitPrice: ContractOraclePrice,
  signer?: PublicKey,
  sessionToken?: PublicKey | null,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [userDepositLedger] = findUserDepositLedgerAddress(owner, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .placeLimitOrderEr({ limitPrice, reserveAmount, sizeAmount, stopLossPrice, takeProfitPrice })
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
      reserveCustody,
      receiveCustody,
      targetOracleAccount: targetOracle,
      reserveOracleAccount: reserveOracle,
      reallocVault,
      eventAuthority,
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .instruction();
}
