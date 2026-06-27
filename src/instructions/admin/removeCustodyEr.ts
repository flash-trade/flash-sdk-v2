import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import {
  findCustodyAddress,
  findCustodyTokenAccountAddress,
  findEventAuthorityAddress,
  findMagicFeeVaultAddress,
  findMultisigAddress,
  findPerpetualsAddress,
  findPoolAddress,
  findReallocVaultAddress,
} from "../../utils";
import { InstructionResult, TokenRatios } from "../../types";
import { validatorKeyForProgramId } from "../../constants";

export interface RemoveCustodyErParams {
  ratios: TokenRatios[];
}

export interface RemoveCustodyErArgs {
  poolName: string;
  custodyTokenMint: PublicKey;
  custodyOracleAccount: PublicKey;
  params: RemoveCustodyErParams;
  marketAccounts: PublicKey[];
  admin?: PublicKey;
}

/** remove_custody_er — direct-ER admin write that removes a custody from a
 *  delegated pool. Mirrors addCustodyEr (admin signer, multisig, pool, custody,
 *  reallocVault). The program validates all pool markets via remaining accounts. */
export async function buildRemoveCustodyEr(
  program: Program,
  args: RemoveCustodyErArgs,
): Promise<InstructionResult> {
  const admin = args.admin ?? program.provider.publicKey!;
  const validator = validatorKeyForProgramId(program.programId);
  const [multisig] = findMultisigAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [pool] = findPoolAddress(args.poolName, program.programId);
  const [custody] = findCustodyAddress(pool, args.custodyTokenMint, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [magicFeeVault] = findMagicFeeVaultAddress(validator);
  const [custodyTokenAccount] = findCustodyTokenAccountAddress(
    pool,
    args.custodyTokenMint,
    program.programId,
  );
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  const ix = await program.methods
    .removeCustodyEr({ ratios: args.params.ratios })
    .accountsPartial({
      admin,
      multisig,
      perpetuals,
      pool,
      custody,
      reallocVault,
      magicFeeVault,
      custodyTokenAccount,
      custodyOracleAccount: args.custodyOracleAccount,
      eventAuthority,
      program: program.programId,
    })
    .remainingAccounts(
      args.marketAccounts.map((pubkey) => ({
        pubkey,
        isSigner: false,
        isWritable: false,
      })),
    )
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
