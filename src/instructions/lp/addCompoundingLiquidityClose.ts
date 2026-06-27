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
  findCompDepositReceiptAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

// Base-layer terminal close action for add_compounding_liquidity (sFLP deposit).
// Normally the `_er` commit queues this as a post-undelegate action; this builder
// lets a client drive it directly to recover a receipt left processed-but-open.
// The settle handler branches internally:
//   user_lp_to_mint/compounding_to_mint > 0  → mint sFLP to the user
//   otherwise                               → refund the deposited token

export interface AddCompoundingLiquidityCloseArgs {
  symbol: string; // deposited custody token
  owner?: PublicKey; // receipt owner; defaults to the provider wallet
}

export async function buildAddCompoundingLiquiditySettle(
  program: Program,
  poolConfig: PoolConfig,
  args: AddCompoundingLiquidityCloseArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;
  const tok = poolConfig.getTokenFromSymbol(args.symbol);
  const custody = poolConfig.custodies.find((c) => c.mintKey.equals(tok.mintKey))!;
  const ix = await program.methods
    .addCompoundingLiquiditySettle()
    .accountsPartial({
      owner,
      compoundingTokenAccount: getAssociatedTokenAddressSync(poolConfig.compoundingTokenMint, owner, true),
      fundingAccount: getAssociatedTokenAddressSync(
        custody.mintKey,
        owner,
        true,
        tok.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      ),
      pool: poolConfig.poolAddress,
      inCustody: custody.custodyAccount,
      inCustodyTokenAccount: custody.tokenAccount,
      inCustodyTokenMint: custody.mintKey,
      poolCompoundingLpVault: poolConfig.compoundingLpVault,
      lpTokenMint: poolConfig.stakedLpTokenMint,
      compoundingTokenMint: poolConfig.compoundingTokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      compoundingDepositReceipt: findCompDepositReceiptAddress(owner, custody.mintKey, program.programId)[0],
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
