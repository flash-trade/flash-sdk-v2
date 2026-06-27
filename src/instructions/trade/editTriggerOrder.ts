import { Program } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import BN from "bn.js";
import {
  findBasketAddress,
  findEventAuthorityAddress,
  findPerpetualsAddress,
} from "../../utils";
import { ContractOraclePrice } from "../../types";

/**
 * Edit a trigger order (TP/SL, direct-ER). Custody + oracle accounts are passed
 * explicitly (resolve them from PoolConfig at the call site).
 */
export async function editTriggerOrder(
  program: Program,
  owner: PublicKey,
  pool: PublicKey,
  market: PublicKey,
  targetCustody: PublicKey,
  lockCustody: PublicKey,
  receiveCustody: PublicKey,
  targetOracle: PublicKey,
  lockOracle: PublicKey,
  orderId: number,
  triggerPrice: ContractOraclePrice,
  deltaSizeAmount: BN,
  isStopLoss: boolean,
  signer?: PublicKey,
  sessionToken?: PublicKey | null,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .editTriggerOrderEr({ orderId, triggerPrice, deltaSizeAmount, isStopLoss })
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
      receiveCustody,
      targetOracleAccount: targetOracle,
      lockOracleAccount: lockOracle,
      eventAuthority,
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .instruction();
}
