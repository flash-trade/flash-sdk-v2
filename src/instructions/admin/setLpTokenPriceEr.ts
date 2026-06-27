import { Program } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID, validatorKeyForProgramId } from "../../constants";
import { buildAumRemainingAccounts } from "../../utils/remainingAccounts";
import {
  findPerpetualsAddress,
  findReallocVaultAddress,
  findMagicFeeVaultAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface SetLpTokenPriceErArgs {
  /** ER runs against the external (MagicBlock) oracle by default. */
  useExtOracle?: boolean;
}

/**
 * set_lp_token_price_er — ER-side LP price refresh. Recomputes the delegated
 * pool's AUM/equity from the forwarded custodies/oracles (remaining accounts),
 * rewrites `lp_price` / `compounding_lp_price`, then commits the pool back to
 * base chain (realloc_vault funds the paid commit; the pool stays delegated).
 * Permissionless, mirroring the base `set_lp_token_price`. Sent directly to the
 * MagicBlock ER.
 */
export async function buildSetLpTokenPriceEr(
  program: Program,
  poolConfig: PoolConfig,
  args: SetLpTokenPriceErArgs = {},
): Promise<InstructionResult> {
  const useExt = args.useExtOracle ?? false;

  const remaining = buildAumRemainingAccounts(poolConfig, {
    includeMarkets: true,
    useExtOracle: useExt,
  });

  const ix = await program.methods
    .setLpTokenPriceEr({})
    .accountsPartial({
      perpetuals: findPerpetualsAddress(program.programId)[0],
      pool: poolConfig.poolAddress,
      reallocVault: findReallocVaultAddress(program.programId)[0],
      magicFeeVault: findMagicFeeVaultAddress(validatorKeyForProgramId(program.programId))[0],
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      magicProgram: MAGIC_PROGRAM_ID,
      magicContext: MAGIC_CONTEXT_ID,
    })
    .remainingAccounts(remaining)
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
