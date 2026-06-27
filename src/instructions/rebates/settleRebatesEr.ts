import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID, validatorKeyForProgramId } from "../../constants";
import {
  findSettleRebatesReceiptAddress,
  findRebateVaultAddress,
  findRebateTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
  findMagicFeeVaultAddress,
  findReallocVaultAddress,
} from "../../utils";

export interface SettleRebatesErArgs {
  pool: PublicKey;
  rewardCustody: PublicKey;
  rewardCustodyOracleAccount: PublicKey;
  rewardCustodyTokenAccount: PublicKey;
  tokenMint: PublicKey;
  /** ER tx signer; need not be the keeper (a throwaway payer is fine). */
  payer: PublicKey;
  keeper?: PublicKey;
  token22?: boolean;
}

/** settle_rebates_er — ER-side commit of the settle_rebates flow. Sent directly
 *  to the MagicBlock ER (the settle_rebates receipt is delegated). Takes no
 *  args; signed by `payer`. */
export async function buildSettleRebatesEr(
  program: Program,
  args: SettleRebatesErArgs,
): Promise<InstructionResult> {
  const keeper = args.keeper ?? program.provider.publicKey!;
  const validator = validatorKeyForProgramId(program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [magicFeeVault] = findMagicFeeVaultAddress(validator);

  const ix = await program.methods
    .settleRebatesEr()
    .accountsPartial({
      keeper,
      payer: args.payer,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      pool: args.pool,
      rewardCustody: args.rewardCustody,
      rewardCustodyOracleAccount: args.rewardCustodyOracleAccount,
      rebateVault: findRebateVaultAddress(program.programId)[0],
      settleRebatesReceipt: findSettleRebatesReceiptAddress(keeper, args.pool, program.programId)[0],
      rewardCustodyTokenAccount: args.rewardCustodyTokenAccount,
      rebateTokenAccount: findRebateTokenAccountAddress(program.programId)[0],
      tokenMint: args.tokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      tokenProgram: args.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      programId: program.programId,
      reallocVault,
      magicFeeVault,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      magicProgram: MAGIC_PROGRAM_ID,
      magicContext: MAGIC_CONTEXT_ID,
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
