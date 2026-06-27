import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { InternalPrice } from "../../types";
import { rw } from "../../utils/remainingAccounts";

export async function setInternalCurrentPriceEr(
  program: Program,
  authority: PublicKey,
  useCurrentTime: number,
  prices: InternalPrice[],
  oracleAccounts: PublicKey[],
) {
  return program.methods
    .setInternalCurrentPriceEr({ useCurrentTime, prices })
    .accountsPartial({ authority })
    .remainingAccounts(oracleAccounts.map(rw))
    .instruction();
}
