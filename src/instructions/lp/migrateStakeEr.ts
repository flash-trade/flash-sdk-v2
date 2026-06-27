import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import { buildAumRemainingAccounts } from "../../utils/remainingAccounts";
import {
  findMigrateStakeReceiptAddress,
  findFlpStakeAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface MigrateStakeErArgs {
  compoundingTokenAccount: PublicKey; // user ATA of compounding (sFLP) mint
  /** ER tx signer; need not be the owner (a throwaway payer is fine). */
  payer: PublicKey;
  owner?: PublicKey;
  rewardSymbol?: string;
  useExtOracle?: boolean;
}

/** migrate_stake_er — ER-side commit of the migrate_stake_with_action flow.
 *  Sent directly to the MagicBlock ER (the migrate receipt is delegated). Takes
 *  no args; signed by `payer`. */
export async function buildMigrateStakeEr(
  program: Program,
  poolConfig: PoolConfig,
  args: MigrateStakeErArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const pool = poolConfig.poolAddress;

  const useExt = args.useExtOracle ?? false;

  const rewardC = poolConfig.custodies.find((c) =>
    c.mintKey.equals(poolConfig.getTokenFromSymbol(args.rewardSymbol ?? "USDC").mintKey),
  )!;

  // Forward the full AUM account set — the handler recomputes pool AUM whenever
  // the pool is stale (>10s), which indexes these; omitting them panics with an
  // out-of-bounds in get_assets_under_management_usd (same as migrate_flp_er).
  const remaining = buildAumRemainingAccounts(poolConfig, {
    includeMarkets: true,
    useExtOracle: useExt,
    whitelist: null,
  });

  const ix = await program.methods
    .migrateStakeEr()
    .accountsPartial({
      owner,
      payer: args.payer,
      pool,
      rewardCustody: rewardC.custodyAccount,
      flpStakeAccount: findFlpStakeAddress(owner, pool, program.programId)[0],
      rewardCustodyOracleAccount: useExt ? rewardC.extOracleAccount : rewardC.intOracleAccount,
      migrateStakeReceipt: findMigrateStakeReceiptAddress(owner, pool, program.programId)[0],
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      compoundingTokenAccount: args.compoundingTokenAccount,
      poolStakedLpVault: poolConfig.stakedLpVault,
      poolCompoundingLpVault: poolConfig.compoundingLpVault,
      lpTokenMint: poolConfig.stakedLpTokenMint,
      compoundingTokenMint: poolConfig.compoundingTokenMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      programId: program.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      magicProgram: MAGIC_PROGRAM_ID,
      magicContext: MAGIC_CONTEXT_ID,
    })
    .remainingAccounts(remaining)
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
