import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findBasketAddress,
  findMultisigAddress,
  findPositionAddress,
  findReallocVaultAddress,
} from "../../utils";

/** migrate_position_to_basket_er — fold a legacy position PDA into the basket. */
export async function migratePositionToBasket(
  program: Program,
  admin: PublicKey,
  owner: PublicKey,
  market: PublicKey,
  lockCustody: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [position] = findPositionAddress(owner, market, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);

  return program.methods
    .migratePositionToBasketEr({})
    .accountsPartial({
      admin,
      multisig,
      owner,
      basket,
      position,
      market,
      lockCustody,
      reallocVault,
    })
    .instruction();
}
