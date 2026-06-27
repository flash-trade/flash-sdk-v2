import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PoolConfig } from "../../PoolConfig";
import { InstructionResult } from "../../types";
import {
  findStakingWithdrawReceiptAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

// Terminal base-layer close action for the staked-LP remove (unstake) flow.
//
// After `remove_liquidity_er` commits (sets receipt.processed=1) and undelegates
// the receipt back to the base chain, remove_liquidity_settle closes it. The
// settle handler branches internally: token_amount_to_withdraw > 0 pays out;
// token_amount_to_withdraw == 0 is a no-op close. This builder lets a client
// recover a receipt left processed-but-open if the queued action did not close.

export interface RemoveLiquidityCloseArgs {
  outSymbol: string;
  /** Receipt owner / liquidity provider. Defaults to the provider wallet. */
  owner?: PublicKey;
}

export interface RemoveLiquiditySettleArgs extends RemoveLiquidityCloseArgs {
  receivingAccount: PublicKey; // user ATA that receives the withdrawn token
}

/** remove_liquidity_settle — single base-layer close for both withdraw outcomes. */
export async function buildRemoveLiquiditySettle(
  program: Program,
  poolConfig: PoolConfig,
  args: RemoveLiquiditySettleArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const tok = poolConfig.getTokenFromSymbol(args.outSymbol);
  const custody = poolConfig.custodies.find((c) => c.mintKey.equals(tok.mintKey))!;
  const receipt = findStakingWithdrawReceiptAddress(owner, custody.mintKey, program.programId)[0];

  const ix = await program.methods
    .removeLiquiditySettle()
    .accountsPartial({
      owner,
      receivingAccount: args.receivingAccount,
      pool: poolConfig.poolAddress,
      custody: custody.custodyAccount,
      custodyTokenAccount: custody.tokenAccount,
      custodyTokenMint: custody.mintKey,
      poolStakedLpVault: poolConfig.stakedLpVault,
      lpTokenMint: poolConfig.stakedLpTokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      stakingWithdrawReceipt: receipt,
      // LP burn uses standard SPL; the custody token transfer may be Token-2022.
      tokenProgram: TOKEN_PROGRAM_ID,
      receivingTokenProgram: tok.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      // Trailing action-injected accounts — inert (no constraints, untouched by
      // the handler) on a direct base call; only meaningful when dispatched as a
      // post-undelegate action. Pass the program id as a harmless read-only stub.
      escrowAuth: program.programId,
      escrow: program.programId,
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
