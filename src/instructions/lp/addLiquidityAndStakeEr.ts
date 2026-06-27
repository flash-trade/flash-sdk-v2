import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "../../constants";
import { buildAumRemainingAccounts } from "../../utils/remainingAccounts";
import {
  findStakingDepositReceiptAddress,
  findFlpStakeAddress,
  findWhitelistAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface AddLiquidityAndStakeErArgs {
  inSymbol: string;
  fundingAccount: PublicKey; // user ATA of the deposited token
  /** ER tx fee payer + signer (e.g. an ephemeral keypair; need not be `owner`). */
  payer: PublicKey;
  /** Liquidity provider / receipt owner. Defaults to the provider wallet. */
  owner?: PublicKey;
  whitelisted?: boolean;
  /** ER runs against the external (MagicBlock) oracle by default. */
  useExtOracle?: boolean;
}

/**
 * add_liquidity_and_stake_er — the ER-side commit step of the staked-LP add flow.
 * Sent directly to the MagicBlock ER (the flp_stake + deposit receipt are
 * delegated). Takes no args (amounts come from the delegated deposit receipt);
 * reads pool AUM via the remaining accounts. Mirrors the on-chain instruction.
 */
export async function buildAddLiquidityAndStakeEr(
  program: Program,
  poolConfig: PoolConfig,
  args: AddLiquidityAndStakeErArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const useExt = args.useExtOracle ?? false;

  const tok = poolConfig.getTokenFromSymbol(args.inSymbol);
  const custody = poolConfig.custodies.find((c) => c.mintKey.equals(tok.mintKey))!;

  const depositReceipt = findStakingDepositReceiptAddress(
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
    .addLiquidityAndStakeEr()
    .accountsPartial({
      owner,
      payer: args.payer,
      pool: poolConfig.poolAddress,
      custody: custody.custodyAccount,
      lpTokenMint: poolConfig.stakedLpTokenMint,
      depositReceipt,
      custodyTokenMint: custody.mintKey,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      flpStakeAccount,
      poolStakedLpVault: poolConfig.stakedLpVault,
      fundingAccount: args.fundingAccount,
      custodyTokenAccount: custody.tokenAccount,
      custodyOracleAccount: useExt ? custody.extOracleAccount : custody.intOracleAccount,
      // Staked-LP mint is standard SPL; funding/custody token may be Token-2022.
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
