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
  findCompWithdrawReceiptAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

// Base-layer terminal close action for remove_compounding_liquidity (sFLP
// withdraw). The `_er` commit queues this as a post-undelegate action; this
// builder drives it directly to recover a processed-but-open receipt. The settle
// handler branches internally:
//   out_token_amount > 0  → pay the redeemed token out
//   out_token_amount == 0 → re-mint the burnt sFLP

export interface RemoveCompoundingLiquidityCloseArgs {
  symbol: string; // withdrawn custody token
  owner?: PublicKey; // receipt owner; defaults to the provider wallet
}

export async function buildRemoveCompoundingLiquiditySettle(
  program: Program,
  poolConfig: PoolConfig,
  args: RemoveCompoundingLiquidityCloseArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const tok = poolConfig.getTokenFromSymbol(args.symbol);
  const custody = poolConfig.custodies.find((c) => c.mintKey.equals(tok.mintKey))!;
  const ix = await program.methods
    .removeCompoundingLiquiditySettle()
    .accountsPartial({
      owner,
      receivingAccount: getAssociatedTokenAddressSync(
        custody.mintKey,
        owner,
        true,
        tok.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      ),
      compoundingTokenAccount: getAssociatedTokenAddressSync(poolConfig.compoundingTokenMint, owner, true),
      pool: poolConfig.poolAddress,
      outCustody: custody.custodyAccount,
      outCustodyTokenAccount: custody.tokenAccount,
      outCustodyTokenMint: custody.mintKey,
      compoundingTokenMint: poolConfig.compoundingTokenMint,
      poolCompoundingLpVault: poolConfig.compoundingLpVault,
      lpTokenMint: poolConfig.stakedLpTokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      compoundingWithdrawReceipt: findCompWithdrawReceiptAddress(owner, custody.mintKey, program.programId)[0],
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
