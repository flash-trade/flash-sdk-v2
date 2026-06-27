import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InstructionResult } from "../../types";
import { delegatedAccountFragment, sharedDelegationAccounts } from "../../utils/delegation";
import {
  findMoveProtocolFeesReceiptAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findTokenVaultAddress,
  findRevenueTokenAccountAddress,
  findProtocolVaultAddress,
  findProtocolTokenAccountAddress,
  findEventAuthorityAddress,
} from "../../utils";

export interface MoveProtocolFeesWithActionArgs {
  pool: PublicKey;
  rewardCustody: PublicKey;
  rewardCustodyTokenAccount: PublicKey;
  tokenMint: PublicKey;
  /** keeper — base-chain signer; funds the receipt rent + delegation. Defaults to provider. */
  keeper?: PublicKey;
  token22?: boolean;
}

/** move_protocol_fees_with_action — delegates the move_protocol_fees receipt to
 *  the ER so the protocol fee sweep can run while the pool is delegated. The
 *  receipt PDA is keyed by [keeper, pool]. */
export async function buildMoveProtocolFeesWithAction(
  program: Program,
  args: MoveProtocolFeesWithActionArgs,
): Promise<InstructionResult> {
  const keeper = args.keeper ?? program.provider.publicKey!;
  const receipt = findMoveProtocolFeesReceiptAddress(keeper, args.pool, program.programId)[0];

  const ix = await program.methods
    .moveProtocolFeesWithAction({})
    .accountsPartial({
      keeper,
      transferAuthority: findTransferAuthorityAddress(program.programId)[0],
      perpetuals: findPerpetualsAddress(program.programId)[0],
      pool: args.pool,
      rewardCustody: args.rewardCustody,
      rewardCustodyTokenAccount: args.rewardCustodyTokenAccount,
      tokenVault: findTokenVaultAddress(program.programId)[0],
      revenueTokenAccount: findRevenueTokenAccountAddress(program.programId)[0],
      protocolVault: findProtocolVaultAddress(program.programId)[0],
      protocolTokenAccount: findProtocolTokenAccountAddress(program.programId)[0],
      tokenMint: args.tokenMint,
      ...delegatedAccountFragment(program.programId, "moveProtocolFeesReceipt", receipt),
      tokenProgram: args.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId,
      ...sharedDelegationAccounts(program.programId),
    })
    .instruction();

  return { instructions: [ix], additionalSigners: [] };
}
