import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import { buildAumRemainingAccounts } from "../../utils/remainingAccounts";
import {
  findCompWithdrawReceiptAddress,
  findWhitelistAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface RemoveCompoundingLiquidityErArgs {
  outSymbol: string;
  receivingAccount: PublicKey; // user ATA that receives the withdrawn token
  compoundingTokenAccount: PublicKey; // user ATA holding the compounding (sFLP) mint
  /** ER tx fee payer + signer (e.g. an ephemeral keypair; need not be `owner`). */
  payer: PublicKey;
  /** Liquidity provider / receipt owner. Defaults to the provider wallet. */
  owner?: PublicKey;
  rewardSymbol?: string;
  whitelisted?: boolean;
  /** ER runs against the external (MagicBlock) oracle by default. */
  useExtOracle?: boolean;
}

/**
 * remove_compounding_liquidity_er — the ER-side commit step of the compounding
 * remove flow. Sent directly to the MagicBlock ER (the receipt is delegated).
 * Takes no args (amounts come from the delegated withdraw receipt). Built from
 * the on-chain instruction, not ported.
 */
export async function buildRemoveCompoundingLiquidityEr(
  program: Program,
  poolConfig: PoolConfig,
  args: RemoveCompoundingLiquidityErArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const useExt = args.useExtOracle ?? false;

  const tok = poolConfig.getTokenFromSymbol(args.outSymbol);
  const outC = poolConfig.custodies.find((c) => c.mintKey.equals(tok.mintKey))!;
  const rewardC = poolConfig.custodies.find((c) =>
    c.mintKey.equals(poolConfig.getTokenFromSymbol(args.rewardSymbol ?? "USDC").mintKey),
  )!;

  const receipt = findCompWithdrawReceiptAddress(owner, outC.mintKey, program.programId)[0];

  const remaining = buildAumRemainingAccounts(poolConfig, {
    includeMarkets: true,
    useExtOracle: useExt,
    whitelist: args.whitelisted ? findWhitelistAddress(owner, program.programId)[0] : null,
  });

  const oracleOf = (c: typeof outC) => (useExt ? c.extOracleAccount : c.intOracleAccount);

  const ix = await program.methods
    .removeCompoundingLiquidityEr()
    .accountsPartial({
      owner,
      payer: args.payer,
      pool: poolConfig.poolAddress,
      outCustody: outC.custodyAccount,
      rewardCustody: rewardC.custodyAccount,
      lpTokenMint: poolConfig.stakedLpTokenMint,
      compoundingWithdrawReceipt: receipt,
      outCustodyTokenMint: outC.mintKey,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      receivingAccount: args.receivingAccount,
      compoundingTokenAccount: args.compoundingTokenAccount,
      poolCompoundingLpVault: poolConfig.compoundingLpVault,
      outCustodyTokenAccount: outC.tokenAccount,
      compoundingTokenMint: poolConfig.compoundingTokenMint,
      outCustodyOracleAccount: oracleOf(outC),
      rewardCustodyOracleAccount: oracleOf(rewardC),
      // Compounding/LP mints are standard SPL; receiving/custody token may be Token-2022.
      tokenProgram: TOKEN_PROGRAM_ID,
      receivingTokenProgram: tok.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
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
