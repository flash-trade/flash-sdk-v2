import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findMagicFeeVaultAddress,
  findMarketAddress,
  findMultisigAddress,
  findReallocVaultAddress,
} from "../../utils";
import { MarketPermissions, Side } from "../../types";
import { validatorKeyForProgramId } from "../../constants";

export async function setMarketConfigEr(
  program: Program,
  targetCustody: PublicKey,
  collateralCustody: PublicKey,
  side: Side,
  maxPayoffBps: BN,
  permissions: MarketPermissions,
  correlation: boolean,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [market] = findMarketAddress(targetCustody, collateralCustody, side, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [magicFeeVault] = findMagicFeeVaultAddress(validatorKeyForProgramId(program.programId));
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .setMarketConfigEr({ maxPayoffBps, permissions, correlation })
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      market,
      targetCustody,
      collateralCustody,
      reallocVault,
      magicFeeVault,
      eventAuthority,
      program: program.programId,
    })
    .instruction();
}
