import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import {
  findEventAuthorityAddress,
  findMagicFeeVaultAddress,
  findMarketAddress,
  findMultisigAddress,
  findPerpetualsAddress,
  findPoolAddress,
  findReallocVaultAddress,
} from "../../utils";
import { InstructionResult, Side } from "../../types";
import { validatorKeyForProgramId } from "../../constants";

export interface RemoveMarketErArgs {
  poolName: string;
  targetCustody: PublicKey;
  collateralCustody: PublicKey;
  side: Side;
  admin?: PublicKey;
}

/** remove_market_er — direct-ER admin write that removes a market from a
 *  delegated pool. Mirrors addMarketEr (admin signer, multisig, pool, market,
 *  reallocVault). Takes no args. */
export async function buildRemoveMarketEr(
  program: Program,
  args: RemoveMarketErArgs,
): Promise<InstructionResult> {
  const admin = args.admin ?? program.provider.publicKey!;
  const validator = validatorKeyForProgramId(program.programId);
  const [multisig] = findMultisigAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [pool] = findPoolAddress(args.poolName, program.programId);
  const [market] = findMarketAddress(
    args.targetCustody,
    args.collateralCustody,
    args.side,
    program.programId,
  );
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [magicFeeVault] = findMagicFeeVaultAddress(validator);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  const ix = await program.methods
    .removeMarketEr()
    .accountsPartial({
      admin,
      multisig,
      perpetuals,
      pool,
      market,
      reallocVault,
      magicFeeVault,
      eventAuthority,
      program: program.programId,
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
