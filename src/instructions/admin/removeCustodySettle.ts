import { Program } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import {
  findCustodyAddress,
  findCustodyTokenAccountAddress,
  findEventAuthorityAddress,
  findMultisigAddress,
  findPerpetualsAddress,
  findPoolAddress,
  findTransferAuthorityAddress,
} from "../../utils";
import { InstructionResult } from "../../types";

export interface RemoveCustodySettleArgs {
  poolName: string;
  custodyTokenMint: PublicKey;
  receivingAccount: PublicKey;
  admin?: PublicKey;
  token22?: boolean;
}

/** remove_custody_settle — base-chain settle of the remove_custody flow after
 *  the ER commits. Requires the pool to no longer reference the custody before
 *  draining and closing accounts. Takes no args. */
export async function buildRemoveCustodySettle(
  program: Program,
  args: RemoveCustodySettleArgs,
): Promise<InstructionResult> {
  const admin = args.admin ?? program.provider.publicKey!;
  const [multisig] = findMultisigAddress(program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [pool] = findPoolAddress(args.poolName, program.programId);
  const [custody] = findCustodyAddress(pool, args.custodyTokenMint, program.programId);
  const [custodyTokenAccount] = findCustodyTokenAccountAddress(
    pool,
    args.custodyTokenMint,
    program.programId,
  );
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  const ix = await program.methods
    .removeCustodySettle()
    .accountsPartial({
      admin,
      multisig,
      transferAuthority,
      perpetuals,
      pool,
      custody,
      custodyTokenAccount,
      receivingAccount: args.receivingAccount,
      receivingTokenMint: args.custodyTokenMint,
      tokenProgram: args.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      eventAuthority,
      program: program.programId,
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
