import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import { buildAumRemainingAccounts } from "../../utils/remainingAccounts";
import {
  findStakingWithdrawReceiptAddress,
  findFlpStakeAddress,
  findWhitelistAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface RemoveLiquidityErArgs {
  outSymbol: string;
  receivingAccount: PublicKey; // user ATA that receives the withdrawn token
  /** ER tx fee payer + signer (e.g. an ephemeral keypair; need not be `owner`). */
  payer: PublicKey;
  /** Liquidity provider / receipt owner. Defaults to the provider wallet. */
  owner?: PublicKey;
  rewardSymbol?: string; // default USDC
  whitelisted?: boolean;
  /** ER runs against the external (MagicBlock) oracle by default. */
  useExtOracle?: boolean;
}

/**
 * remove_liquidity_er — the ER-side commit step of the staked-LP remove flow.
 * Sent directly to the MagicBlock ER (the flp_stake + staking_withdraw receipt
 * are delegated). Takes no args (amounts come from the delegated withdraw
 * receipt); reads pool AUM via the remaining accounts. Mirrors the on-chain
 * instruction.
 */
export async function buildRemoveLiquidityEr(
  program: Program,
  poolConfig: PoolConfig,
  args: RemoveLiquidityErArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const useExt = args.useExtOracle ?? false;

  const tok = poolConfig.getTokenFromSymbol(args.outSymbol);
  const custody = poolConfig.custodies.find((c) => c.mintKey.equals(tok.mintKey))!;
  const rewardC = poolConfig.custodies.find((c) =>
    c.mintKey.equals(poolConfig.getTokenFromSymbol(args.rewardSymbol ?? "USDC").mintKey),
  )!;

  const withdrawReceipt = findStakingWithdrawReceiptAddress(
    owner,
    custody.mintKey,
    program.programId,
  )[0];
  const flpStakeAccount = findFlpStakeAddress(
    owner,
    poolConfig.poolAddress,
    program.programId,
  )[0];

  const remaining = buildAumRemainingAccounts(poolConfig, {
    includeMarkets: true,
    useExtOracle: useExt,
    whitelist: args.whitelisted ? findWhitelistAddress(owner, program.programId)[0] : null,
  });

  const ix = await program.methods
    .removeLiquidityEr()
    .accountsPartial({
      owner,
      payer: args.payer,
      pool: poolConfig.poolAddress,
      custody: custody.custodyAccount,
      rewardCustody: rewardC.custodyAccount,
      lpTokenMint: poolConfig.stakedLpTokenMint,
      flpStakeAccount,
      stakingWithdrawReceipt: withdrawReceipt,
      custodyTokenMint: custody.mintKey,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      poolStakedLpVault: poolConfig.stakedLpVault,
      receivingAccount: args.receivingAccount,
      custodyTokenAccount: custody.tokenAccount,
      custodyOracleAccount: useExt ? custody.extOracleAccount : custody.intOracleAccount,
      // Staked-LP mint is standard SPL; receiving/custody token may be Token-2022.
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
