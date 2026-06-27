import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { findBasketAddress } from "../../utils";

/** init_basket — create a user's basket (holds positions + orders inline). */
export async function initializeBasket(
  program: Program,
  owner: PublicKey,
  // Mirror InitBasketErParams::default(); larger capacities push Basket::space
  // past the 10240-byte CPI account-creation limit (InvalidRealloc).
  positionCapacity = 4,
  orderCapacity = 4,
  ledgerCapacity = 4,
  orderItemCapacity = 5,
  payer: PublicKey = program.provider.publicKey!,
) {
  const [basket] = findBasketAddress(owner, program.programId);

  return program.methods
    .initBasket({
      positionCapacity,
      orderCapacity,
      ledgerCapacity,
      orderItemCapacity,
    })
    .accountsPartial({
      owner,
      payer,
      basket,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}
