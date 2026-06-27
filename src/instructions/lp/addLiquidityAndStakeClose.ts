import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import {
  findStakingDepositReceiptAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

// Base-layer terminal close action for add_liquidity_and_stake (staked FLP
// deposit). The `_er` commit queues this as a post-undelegate action; this
// builder drives it directly to recover a processed-but-open receipt. The settle
// handler branches internally:
//   lp_tokens_to_mint > 0  → mint + stake the FLP
//   lp_tokens_to_mint == 0 → refund the deposited token

export interface AddLiquidityAndStakeCloseArgs {
  symbol: string; // deposited custody token
  owner?: PublicKey; // receipt owner; defaults to the provider wallet
}

export async function buildAddLiquidityAndStakeSettle(
  program: Program,
  poolConfig: PoolConfig,
  args: AddLiquidityAndStakeCloseArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const tok = poolConfig.getTokenFromSymbol(args.symbol);
  const custody = poolConfig.custodies.find((c) => c.mintKey.equals(tok.mintKey))!;
  const ix = await program.methods
    .addLiquidityAndStakeSettle()
    .accountsPartial({
      owner,
      receivingAccount: getAssociatedTokenAddressSync(
        custody.mintKey,
        owner,
        true,
        tok.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      ),
      pool: poolConfig.poolAddress,
      custody: custody.custodyAccount,
      custodyTokenAccount: custody.tokenAccount,
      custodyTokenMint: custody.mintKey,
      poolStakedLpVault: poolConfig.stakedLpVault,
      lpTokenMint: poolConfig.stakedLpTokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      depositReceipt: findStakingDepositReceiptAddress(owner, custody.mintKey, program.programId)[0],
      tokenProgram: TOKEN_PROGRAM_ID,
      receivingTokenProgram: tok.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      escrowAuth: program.programId,
      escrow: program.programId,
    })
    .instruction();
  return { instructions: [ix], additionalSigners: [] };
}
