import { Program } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import BN from "bn.js";
import {
  findBasketAddress,
  findEventAuthorityAddress,
  findPerpetualsAddress,
  findUserDepositLedgerAddress,
} from "../../utils";
import { ContractOraclePrice } from "../../types";

/**
 * Edit a resting limit order (direct-ER). Custody + oracle accounts are passed
 * explicitly (resolve them from PoolConfig at the call site).
 */
export async function editLimitOrder(
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
  orderId: number,
  limitPrice: ContractOraclePrice,
  sizeAmount: BN,
  stopLossPrice: ContractOraclePrice,
  takeProfitPrice: ContractOraclePrice,
  signer?: PublicKey,
  sessionToken?: PublicKey | null,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [userDepositLedger] = findUserDepositLedgerAddress(owner, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .editLimitOrderEr({ orderId, limitPrice, sizeAmount, stopLossPrice, takeProfitPrice })
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
      eventAuthority,
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .instruction();
}
