import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import {
  findMigrateStakeReceiptAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

// Base-layer terminal close action for migrate_stake (staked FLP → sFLP). The
// `_er` commit queues this as a post-undelegate action; this builder drives it
// directly to recover a processed-but-open receipt. The settle handler gates each
// operation by the receipt amount, so failed migrate receipts close here too.

export interface MigrateStakeCloseArgs {
  owner?: PublicKey; // receipt owner; defaults to the provider wallet
}

export async function buildMigrateStakeSettle(
  program: Program,
  poolConfig: PoolConfig,
  args: MigrateStakeCloseArgs = {},
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const pool = poolConfig.poolAddress;
  const ix = await program.methods
    .migrateStakeSettle()
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
      migrateStakeReceipt: findMigrateStakeReceiptAddress(owner, pool, program.programId)[0],
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
