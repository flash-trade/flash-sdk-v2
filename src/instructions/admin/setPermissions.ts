import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { findMultisigAddress, findPerpetualsAddress } from "../../utils";
import { Permissions } from "../../types";

export interface SetPermissionsParams {
  permissions: Permissions;
}

export async function setPermissions(
  program: Program,
  params: SetPermissionsParams,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);

  return program.methods
    .setPermissions(params)
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      perpetuals,
    })
    .instruction();
}
