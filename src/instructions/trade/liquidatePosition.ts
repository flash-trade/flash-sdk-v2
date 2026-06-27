import { Program } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import {
  findBasketAddress,
  findEventAuthorityAddress,
  findPerpetualsAddress,
} from "../../utils";

/**
 * Liquidate a position (direct-ER). No session — `signer` is the
 * liquidator/keeper (defaults to the provider wallet). `owner` is the position
 * owner (basket seed). Custody + oracle accounts are passed explicitly (resolve
 * them from PoolConfig at the call site).
 */
export async function liquidatePosition(
  program: Program,
  owner: PublicKey,
  pool: PublicKey,
  market: PublicKey,
  targetCustody: PublicKey,
  lockCustody: PublicKey,
  targetOracle: PublicKey,
  lockOracle: PublicKey,
  signer?: PublicKey,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(owner, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .liquidatePositionEr({})
    .accountsPartial({
      signer: signer ?? program.provider.publicKey!,
      perpetuals,
      basket,
      pool,
      market,
      targetCustody,
      lockCustody,
      targetOracleAccount: targetOracle,
      lockOracleAccount: lockOracle,
      eventAuthority,
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .instruction();
}
