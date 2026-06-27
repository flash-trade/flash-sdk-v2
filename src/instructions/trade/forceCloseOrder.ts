import { Program } from "@coral-xyz/anchor";
import { AccountMeta, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import {
  findBasketAddress,
  findEventAuthorityAddress,
  findMultisigAddress,
  findPerpetualsAddress,
  findReallocVaultAddress,
} from "../../utils";
import { rw } from "../../utils/remainingAccounts";

export interface ForceCloseOrderArgs {
  owner: PublicKey;
  pool: PublicKey;
  market: PublicKey;
  targetCustody: PublicKey;
  lockCustody: PublicKey;
  reserveCustody: PublicKey;
  admin?: PublicKey;
  /** Additional reserve custodies used by active limit orders. Must be writable. */
  additionalReserveCustodies?: PublicKey[];
  additionalReserveCustodyMetas?: AccountMeta[];
}

/**
 * force_close_order_er — admin force-closes all basket-backed orders for a
 * disabled market. The fixed `reserveCustody` is the primary reserve custody;
 * any other reserve custodies used by active limit orders must be supplied as
 * writable remaining accounts.
 */
export async function forceCloseOrder(
  program: Program,
  args: ForceCloseOrderArgs,
) {
  const admin = args.admin ?? program.provider.publicKey!;
  const [multisig] = findMultisigAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(args.owner, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);
  const remainingReserveCustodies = [
    ...(args.additionalReserveCustodies ?? []).map(rw),
    ...(args.additionalReserveCustodyMetas ?? []),
  ];

  return program.methods
    .forceCloseOrderEr({})
    .accountsPartial({
      admin,
      multisig,
      perpetuals,
      basket,
      pool: args.pool,
      market: args.market,
      targetCustody: args.targetCustody,
      lockCustody: args.lockCustody,
      reserveCustody: args.reserveCustody,
      reallocVault,
      eventAuthority,
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .remainingAccounts(remainingReserveCustodies)
    .instruction();
}
