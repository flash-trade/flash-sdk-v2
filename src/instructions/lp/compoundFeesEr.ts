import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import { buildAumRemainingAccounts } from "../../utils/remainingAccounts";
import {
  findCompoundFeesReceiptAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface CompoundFeesErArgs {
  /** ER tx signer; need not be the keeper (a throwaway payer is fine). */
  payer: PublicKey;
  keeper?: PublicKey; // defaults to wallet
  rewardSymbol?: string;
  useExtOracle?: boolean;
}

/** compound_fees_er — ER-side commit of the compound_fees_with_action flow.
 *  Sent directly to the MagicBlock ER (the compound fees receipt is delegated).
 *  Takes no args; signed by `payer`. */
export async function buildCompoundFeesEr(
  program: Program,
  poolConfig: PoolConfig,
  args: CompoundFeesErArgs,
): Promise<InstructionResult> {
  const keeper = args.keeper ?? program.provider.publicKey!;
  const pool = poolConfig.poolAddress;

  const rewardC = poolConfig.custodies.find((c) =>
    c.mintKey.equals(poolConfig.getTokenFromSymbol(args.rewardSymbol ?? "USDC").mintKey),
  )!;

  // AUM tail the on-chain compound_fees_er reads to recompute pool equity:
  // [custodies, oracles, markets] (no whitelist). Oracle mode matches the
  // reward-oracle selection below.
  const remaining = buildAumRemainingAccounts(poolConfig, {
    includeMarkets: true,
    useExtOracle: args.useExtOracle ?? false,
  });

  const ix = await program.methods
    .compoundFeesEr()
    .accountsPartial({
      keeper,
      payer: args.payer,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      pool,
      rewardCustody: rewardC.custodyAccount,
      rewardCustodyOracleAccount: args.useExtOracle ? rewardC.extOracleAccount : rewardC.intOracleAccount,
      lpTokenMint: poolConfig.stakedLpTokenMint,
      poolCompoundingLpVault: poolConfig.compoundingLpVault,
      compoundFeesReceipt: findCompoundFeesReceiptAddress(keeper, pool, program.programId)[0],
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
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
