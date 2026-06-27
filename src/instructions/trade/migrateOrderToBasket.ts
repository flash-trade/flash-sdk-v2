import { Program } from "@coral-xyz/anchor";
import { AccountMeta, PublicKey } from "@solana/web3.js";
import {
  findBasketAddress,
  findMultisigAddress,
  findOrderAddress,
  findReallocVaultAddress,
} from "../../utils";

/** migrate_order_to_basket_er — fold a legacy order PDA into the basket. */
export async function migrateOrderToBasket(
  program: Program,
  admin: PublicKey,
  owner: PublicKey,
  market: PublicKey,
  lockCustody: PublicKey,
  reserveCustody: PublicKey,
  additionalReserveCustodies: PublicKey[] = [],
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [order] = findOrderAddress(owner, market, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);

  return program.methods
    .migrateOrderToBasketEr({})
    .accountsPartial({
      admin,
      multisig,
      owner,
      basket,
      order,
      market,
      lockCustody,
      reserveCustody,
      reallocVault,
    })
    .remainingAccounts(
      additionalReserveCustodies.map(
        (pubkey): AccountMeta => ({
          pubkey,
          isSigner: false,
          isWritable: false,
        }),
      ),
    )
    .instruction();
}
