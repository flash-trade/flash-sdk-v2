import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findBasketAddress,
  findEventAuthorityAddress,
  findPerpetualsAddress,
} from "../../utils";

/**
 * Cancel a trigger order (TP/SL, direct-ER). `market` is passed as a method arg,
 * not an account.
 */
export async function cancelTriggerOrder(
  program: Program,
  owner: PublicKey,
  market: PublicKey,
  orderId: number,
  isStopLoss: boolean,
  signer?: PublicKey,
  sessionToken?: PublicKey | null,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .cancelTriggerOrderEr({ market, orderId, isStopLoss })
    .accountsPartial({
      owner,
      signer: signer ?? owner,
      sessionToken: sessionToken ?? program.programId,
      perpetuals,
      basket,
      eventAuthority,
      program: program.programId,
    })
    .instruction();
}
