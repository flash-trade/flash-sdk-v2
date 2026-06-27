import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { delegatedAccountFragment, sharedDelegationAccounts } from "../../utils/delegation";
import {
  findCollectRevenueReceiptAddress,
  findTokenStakeAddress,
  findTokenVaultAddress,
  findRevenueTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface CollectRevenueWithActionArgs {
  revenueTokenMint: PublicKey; // revenue token mint
  receivingRevenueAccount: PublicKey; // user ATA of the revenue mint
  owner?: PublicKey;
  token22?: boolean;
}

/** collect_revenue_with_action — delegates the collect_revenue receipt to the
 *  ER; a keeper (or `collectRevenueEr`) drives the ER claim + settle.
 *  Only the receipt is delegated (the token_stake account is read directly). */
export async function buildCollectRevenueWithAction(
  program: Program,
  args: CollectRevenueWithActionArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const receipt = findCollectRevenueReceiptAddress(owner, program.programId)[0];

  const ix = await program.methods
    .collectRevenueWithAction({})
    .accountsPartial({
      owner,
      receivingRevenueAccount: args.receivingRevenueAccount,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      tokenVault: findTokenVaultAddress(program.programId)[0],
      revenueTokenAccount: findRevenueTokenAccountAddress(program.programId)[0],
      revenueTokenMint: args.revenueTokenMint,
      tokenStakeAccount: findTokenStakeAddress(owner, program.programId)[0],
      ...delegatedAccountFragment(program.programId, "collectRevenueReceipt", receipt),
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      tokenProgram: args.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      ...sharedDelegationAccounts(program.programId),
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
