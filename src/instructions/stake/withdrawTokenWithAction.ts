import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { delegatedAccountFragment, sharedDelegationAccounts } from "../../utils/delegation";
import {
  findWithdrawTokenReceiptAddress,
  findTokenStakeAddress,
  findTokenVaultAddress,
  findTokenVaultTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface WithdrawTokenWithActionArgs {
  tokenMint: PublicKey; // FAF (staked) token mint
  receivingTokenAccount: PublicKey; // user ATA of the FAF mint
  /** Index into the staker's `withdraw_request` array to settle (matured unstake). */
  withdrawRequestId: number;
  owner?: PublicKey;
  token22?: boolean;
}

/** withdraw_token_with_action — delegates the withdraw receipt (recording the
 *  target withdraw_request_id) to the ER; `withdrawTokenEr` then drives the ER
 *  withdraw + settle. Only the receipt is delegated (the token_stake account is
 *  forwarded to the ER). Mirrors collect_token_reward_with_action. */
export async function buildWithdrawTokenWithAction(
  program: Program,
  args: WithdrawTokenWithActionArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const receipt = findWithdrawTokenReceiptAddress(owner, program.programId)[0];

  const ix = await program.methods
    .withdrawTokenWithAction({
      withdrawRequestId: args.withdrawRequestId,
    })
    .accountsPartial({
      owner,
      tokenVault: findTokenVaultAddress(program.programId)[0],
      tokenVaultTokenAccount: findTokenVaultTokenAccountAddress(program.programId)[0],
      tokenMint: args.tokenMint,
      tokenStakeAccount: findTokenStakeAddress(owner, program.programId)[0],
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      receivingTokenAccount: args.receivingTokenAccount,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      ...delegatedAccountFragment(program.programId, "receipt", receipt),
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
