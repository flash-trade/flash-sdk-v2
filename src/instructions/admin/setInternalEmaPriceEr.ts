import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { InternalEmaPrice } from "../../types";
import { rw } from "../../utils/remainingAccounts";

export async function setInternalEmaPriceEr(
  program: Program,
  authority: PublicKey,
  prices: InternalEmaPrice[],
  oracleAccounts: PublicKey[],
) {
  return program.methods
    .setInternalEmaPriceEr({ prices })
    .accountsPartial({ authority })
    .remainingAccounts(oracleAccounts.map(rw))
    .instruction();
}
