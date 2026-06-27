import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import { findMultisigAddress, findBasketAddress } from "../../utils";

/** undelegate_basket — bring a single owner's basket back to base. */
export async function undelegateBasket(
  program: Program,
  owner: PublicKey,
  admin?: PublicKey,
) {
  return program.methods.undelegateBasket()
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig: findMultisigAddress(program.programId)[0],
      owner,
      basket: findBasketAddress(owner, program.programId)[0],
      magicProgram: MAGIC_PROGRAM_ID,
      magicContext: MAGIC_CONTEXT_ID,
    }).instruction();
}
