import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { delegatedAccountFragment, sharedDelegationAccounts } from "../../utils/delegation";
import {
  findTokenStakeAddress,
  findTokenStakeDepositReceiptAddress,
  findTokenVaultAddress,
  findTokenVaultTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface DepositTokenStakeWithActionArgs {
  tokenMint: PublicKey; // governance token mint
  fundingAccount: PublicKey; // user ATA of the staked token
  depositAmount: BN;
  owner?: PublicKey;
  /** Funding token program (governance token may be Token-2022). */
  token22?: boolean;
}

/** deposit_token_stake_with_action — delegates BOTH the token_stake account and
 *  the deposit receipt to the ER AND queues `deposit_token_stake_er` as an
 *  auto-run post-delegation action (the validator/keeper executes it right after
 *  this tx, which then queues the base-chain settle). Token-stake `_with_action`
 *  params carry no `queue_er_action` opt-out (unlike the staked-LP flow): `_er` is
 *  always queued. So the client does NOT need to send `depositTokenStakeEr`
 *  itself — that is a recovery path only, for when the auto-action fails to run.
 *  Driving it on an already-processed receipt fails with
 *  AccountDiscriminatorNotFound. */
export async function buildDepositTokenStakeWithAction(
  program: Program,
  args: DepositTokenStakeWithActionArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const tokenStakeAccount = findTokenStakeAddress(owner, program.programId)[0];
  const depositReceipt = findTokenStakeDepositReceiptAddress(owner, program.programId)[0];

  const ix = await program.methods
    .depositTokenStakeWithAction({
      depositAmount: args.depositAmount,
    })
    .accountsPartial({
      owner,
      fundingAccount: args.fundingAccount,
      tokenVault: findTokenVaultAddress(program.programId)[0],
      tokenVaultTokenAccount: findTokenVaultTokenAccountAddress(program.programId)[0],
      tokenMint: args.tokenMint,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      ...delegatedAccountFragment(program.programId, "tokenStakeAccount", tokenStakeAccount),
      ...delegatedAccountFragment(program.programId, "depositReceipt", depositReceipt),
      tokenProgram: TOKEN_PROGRAM_ID,
      fundingTokenProgram: args.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      ...sharedDelegationAccounts(program.programId),
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
