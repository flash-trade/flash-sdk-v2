import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findBasketAddress,
  findEventAuthorityAddress,
  findPerpetualsAddress,
} from "../../utils";

/**
 * Cancel a resting limit order (direct-ER). `market` is passed as a method arg,
 * not an account. Custody accounts are passed explicitly (resolve them from
 * PoolConfig at the call site).
 */
export async function cancelLimitOrder(
  program: Program,
  owner: PublicKey,
  pool: PublicKey,
  market: PublicKey,
  targetCustody: PublicKey,
  lockCustody: PublicKey,
  reserveCustody: PublicKey,
  orderId: number,
  signer?: PublicKey,
  sessionToken?: PublicKey | null,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .cancelLimitOrderEr({ market, orderId })
    .accountsPartial({
      owner,
      signer: signer ?? owner,
      sessionToken: sessionToken ?? program.programId,
      perpetuals,
      basket,
      pool,
      targetCustody,
      lockCustody,
      reserveCustody,
      eventAuthority,
      program: program.programId,
    })
    .instruction();
}
