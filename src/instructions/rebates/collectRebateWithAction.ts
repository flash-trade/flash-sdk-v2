import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { delegatedAccountFragment, sharedDelegationAccounts } from "../../utils/delegation";
import {
  findCollectRebateReceiptAddress,
  findTokenStakeAddress,
  findRebateVaultAddress,
  findRebateTokenAccountAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface CollectRebateWithActionArgs {
  rebateTokenMint: PublicKey; // rebate token mint
  receivingTokenAccount: PublicKey; // user ATA of the rebate mint
  owner?: PublicKey;
  token22?: boolean;
}

/** collect_rebate_with_action — delegates the collect_rebate receipt to the ER;
 *  a keeper (or `collectRebateEr`) drives the ER claim + settle. Only the
 *  receipt is delegated (the token_stake account is read directly). */
export async function buildCollectRebateWithAction(
  program: Program,
  args: CollectRebateWithActionArgs,
): Promise<InstructionResult> {
  const owner = args.owner ?? program.provider.publicKey!;

  const receipt = findCollectRebateReceiptAddress(owner, program.programId)[0];

  const ix = await program.methods
    .collectRebateWithAction({})
    .accountsPartial({
      owner,
      receivingTokenAccount: args.receivingTokenAccount,
      perpetuals: findPerpetualsAddress(program.programId)[0],
      rebateVault: findRebateVaultAddress(program.programId)[0],
      rebateTokenAccount: findRebateTokenAccountAddress(program.programId)[0],
      rebateTokenMint: args.rebateTokenMint,
      tokenStakeAccount: findTokenStakeAddress(owner, program.programId)[0],
      ...delegatedAccountFragment(program.programId, "collectRebateReceipt", receipt),
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
