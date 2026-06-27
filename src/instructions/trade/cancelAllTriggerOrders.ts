import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findBasketAddress,
  findEventAuthorityAddress,
  findPerpetualsAddress,
} from "../../utils";

/**
 * Cancel all trigger orders (TP/SL, direct-ER) for a market. `market` is passed
 * as a method arg, not an account.
 */
export async function cancelAllTriggerOrders(
  program: Program,
  owner: PublicKey,
  market: PublicKey,
  signer?: PublicKey,
  sessionToken?: PublicKey | null,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .cancelAllTriggerOrdersEr({ market })
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
