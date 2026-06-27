import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import {
  findEventAuthorityAddress,
  findMarketAddress,
  findMultisigAddress,
  findPoolAddress,
} from "../../utils";
import { InstructionResult, Side } from "../../types";

export interface RemoveMarketSettleArgs {
  poolName: string;
  targetCustody: PublicKey;
  collateralCustody: PublicKey;
  side: Side;
  admin?: PublicKey;
}

/** remove_market_settle — base-chain settle of the remove_market flow after the
 *  ER commits. Requires the pool to no longer reference the market before
 *  closing it. Takes no args. */
export async function buildRemoveMarketSettle(
  program: Program,
  args: RemoveMarketSettleArgs,
): Promise<InstructionResult> {
  const admin = args.admin ?? program.provider.publicKey!;
  const [multisig] = findMultisigAddress(program.programId);
  const [pool] = findPoolAddress(args.poolName, program.programId);
  const [market] = findMarketAddress(
    args.targetCustody,
    args.collateralCustody,
    args.side,
    program.programId,
  );
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  const ix = await program.methods
    .removeMarketSettle()
    .accountsPartial({
      admin,
      multisig,
      pool,
      market,
      eventAuthority,
      program: program.programId,
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
