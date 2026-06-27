import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { delegatedAccountFragment, sharedDelegationAccounts } from "../../utils/delegation";
import {
  findSettleRebatesReceiptAddress,
  findRebateVaultAddress,
  findRebateTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface SettleRebatesWithActionArgs {
  pool: PublicKey;
  /** pool.reward_custody + its oracle / token account / mint (resolve from pool). */
  rewardCustody: PublicKey;
  rewardCustodyOracleAccount: PublicKey;
  rewardCustodyTokenAccount: PublicKey;
  tokenMint: PublicKey;
  /** keeper — base-chain signer; funds the receipt rent + delegation. Defaults to provider. */
  keeper?: PublicKey;
  token22?: boolean;
}

/** settle_rebates_with_action — delegates the settle_rebates receipt to the ER so
 *  the pool's referral rebate can be swept from its reward_custody into the
 *  rebate vault while the pool is delegated. A keeper (or `buildSettleRebatesEr`)
 *  then drives the ER commit + settle. The receipt PDA is keyed by
 *  [keeper, pool]. */
export async function buildSettleRebatesWithAction(
  program: Program,
  args: SettleRebatesWithActionArgs,
): Promise<InstructionResult> {
  const keeper = args.keeper ?? program.provider.publicKey!;
  const receipt = findSettleRebatesReceiptAddress(keeper, args.pool, program.programId)[0];

  const ix = await program.methods
    .settleRebatesWithAction({})
    .accountsPartial({
      keeper,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      pool: args.pool,
      rewardCustody: args.rewardCustody,
      rewardCustodyOracleAccount: args.rewardCustodyOracleAccount,
      rewardCustodyTokenAccount: args.rewardCustodyTokenAccount,
      rebateVault: findRebateVaultAddress(program.programId)[0],
      rebateTokenAccount: findRebateTokenAccountAddress(program.programId)[0],
      tokenMint: args.tokenMint,
      ...delegatedAccountFragment(program.programId, "settleRebatesReceipt", receipt),
      tokenProgram: args.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      ...sharedDelegationAccounts(program.programId),
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
