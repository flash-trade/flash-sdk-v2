import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import {
  findMigrateFlpReceiptAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

// Base-layer terminal close action for migrate_flp (sFLP → staked FLP). The
// `_er` commit queues this as a post-undelegate action; this builder drives it
// directly to recover a processed-but-open receipt. The settle handler branches
// internally:
//   lp_amount_out > 0  → LP into the staked vault
//   lp_amount_out == 0 → re-mint the upfront-burnt sFLP

export interface MigrateFlpCloseArgs {
  owner?: PublicKey; // receipt owner; defaults to the provider wallet
}

export async function buildMigrateFlpSettle(
  program: Program,
  poolConfig: PoolConfig,
  args: MigrateFlpCloseArgs = {},
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const pool = poolConfig.poolAddress;
  const ix = await program.methods
    .migrateFlpSettle()
    .accountsPartial({
      owner,
      compoundingTokenAccount: getAssociatedTokenAddressSync(poolConfig.compoundingTokenMint, owner, true),
      pool,
      poolStakedLpVault: poolConfig.stakedLpVault,
      poolCompoundingLpVault: poolConfig.compoundingLpVault,
      lpTokenMint: poolConfig.stakedLpTokenMint,
      compoundingTokenMint: poolConfig.compoundingTokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      migrateFlpReceipt: findMigrateFlpReceiptAddress(owner, pool, program.programId)[0],
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      escrowAuth: program.programId,
      escrow: program.programId,
    })
    .instruction();
  return { instructions: [ix], additionalSigners: [] };
}
