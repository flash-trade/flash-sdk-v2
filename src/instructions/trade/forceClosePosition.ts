import { Program } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import {
  findBasketAddress,
  findEventAuthorityAddress,
  findMultisigAddress,
  findPerpetualsAddress,
  findReallocVaultAddress,
} from "../../utils";

export interface ForceClosePositionArgs {
  owner: PublicKey;
  pool: PublicKey;
  market: PublicKey;
  targetCustody: PublicKey;
  lockCustody: PublicKey;
  targetOracle: PublicKey;
  lockOracle: PublicKey;
  admin?: PublicKey;
}

/**
 * force_close_position_er — admin force-closes a basket-backed position on a
 * disabled market. `owner` is the basket owner; `admin` must be a multisig
 * signer and defaults to the provider wallet.
 */
export async function forceClosePosition(
  program: Program,
  args: ForceClosePositionArgs,
) {
  const admin = args.admin ?? program.provider.publicKey!;
  const [multisig] = findMultisigAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [basket] = findBasketAddress(args.owner, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .forceClosePositionEr({})
    .accountsPartial({
      admin,
      multisig,
      perpetuals,
      basket,
      pool: args.pool,
      market: args.market,
      targetCustody: args.targetCustody,
      lockCustody: args.lockCustody,
      targetOracleAccount: args.targetOracle,
      lockOracleAccount: args.lockOracle,
      reallocVault,
      eventAuthority,
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .instruction();
}
