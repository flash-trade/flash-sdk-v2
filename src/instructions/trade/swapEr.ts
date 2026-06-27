import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import { buildAumRemainingAccounts } from "../../utils/remainingAccounts";
import {
  findSwapReceiptAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
  findWhitelistAddress,
} from "../../utils";

export interface SwapErArgs {
  inSymbol: string;
  outSymbol: string;
  inAccount: PublicKey; // user ATA (in)
  outAccount: PublicKey; // user ATA (out)
  /** ER tx signer; need not be the owner (a throwaway payer is fine). */
  payer: PublicKey;
  owner?: PublicKey; // defaults to wallet
  useExtOracle?: boolean;
}

/** swap_er — ER-side commit of the swap_with_action flow. Sent directly to the
 *  MagicBlock ER (the swap receipt is delegated). Takes no args; signed by
 *  `payer`. */
export async function buildSwapEr(
  program: Program,
  poolConfig: PoolConfig,
  args: SwapErArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const inTok = poolConfig.getTokenFromSymbol(args.inSymbol);
  const outTok = poolConfig.getTokenFromSymbol(args.outSymbol);
  const inC = poolConfig.custodies.find((c) => c.mintKey.equals(inTok.mintKey))!;
  const outC = poolConfig.custodies.find((c) => c.mintKey.equals(outTok.mintKey))!;

  // swap_er reads [custodies, oracles] for AUM (ExcludePnl — no markets) and the
  // whitelist as the MANDATORY last remaining account (InvalidWhitelistAccount
  // otherwise). Mirrors swapWithAction.
  const remaining = buildAumRemainingAccounts(poolConfig, {
    includeMarkets: false,
    useExtOracle: args.useExtOracle,
    whitelist: findWhitelistAddress(owner, program.programId)[0],
  });

  const ix = await program.methods
    .swapEr()
    .accountsPartial({
      owner,
      payer: args.payer,
      pool: poolConfig.poolAddress,
      inCustody: inC.custodyAccount,
      outCustody: outC.custodyAccount,
      inCustodyOracleAccount: args.useExtOracle ? inC.extOracleAccount : inC.intOracleAccount,
      outCustodyOracleAccount: args.useExtOracle ? outC.extOracleAccount : outC.intOracleAccount,
      swapReceipt: findSwapReceiptAddress(owner, inC.mintKey, outC.mintKey, program.programId)[0],
      inMint: inC.mintKey,
      outMint: outC.mintKey,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      inAccount: args.inAccount,
      outAccount: args.outAccount,
      inCustodyTokenAccount: inC.tokenAccount,
      outCustodyTokenAccount: outC.tokenAccount,
      inTokenProgram: inTok.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      outTokenProgram: outTok.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
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
