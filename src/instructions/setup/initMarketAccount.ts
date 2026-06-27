import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  findCustodyAddress,
  findMarketAddress,
  findMultisigAddress,
  findPerpetualsAddress,
  findPoolAddress,
  findTransferAuthorityAddress,
  sideToAnchor,
} from "../../utils";
import { MarketPermissions, Side } from "../../types";

export async function initMarketAccount(
  program: Program,
  poolName: string,
  targetCustodyMint: PublicKey,
  collateralCustodyMint: PublicKey,
  side: Side,
  correlation: boolean,
  maxPayoffBps: BN,
  permissions: MarketPermissions,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [pool, poolBump] = findPoolAddress(poolName, program.programId);
  const [targetCustody, targetCustodyBump] = findCustodyAddress(pool, targetCustodyMint, program.programId);
  const [collateralCustody, collateralCustodyBump] = findCustodyAddress(
    pool,
    collateralCustodyMint,
    program.programId,
  );
  const [market] = findMarketAddress(targetCustody, collateralCustody, side, program.programId);

  return program.methods
    .initMarketAccount({
      poolName,
      poolBump,
      targetCustodyMint,
      targetCustodyBump,
      collateralCustodyMint,
      collateralCustodyBump,
      side: sideToAnchor(side),
      correlation,
      maxPayoffBps,
      permissions,
    })
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      transferAuthority,
      perpetuals,
      pool,
      targetCustody,
      collateralCustody,
      market,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
}
