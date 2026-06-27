import { Program } from "@coral-xyz/anchor";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findRebateVaultAddress,
  findRebateTokenAccountAddress,
  findEventAuthorityAddress,
} from "../../utils";

const tp = (token22?: boolean) => (token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);

/** settle_rebates — keeper: move referral rebate from the pool's reward custody
 *  into the rebate vault. Pass the pool's `reward_custody` accounts explicitly. */
export async function settleRebates(
  program: Program,
  pool: PublicKey,
  rewardCustody: PublicKey,
  rewardCustodyOracleAccount: PublicKey,
  rewardCustodyTokenAccount: PublicKey,
  tokenMint: PublicKey,
  opts: { token22?: boolean } = {},
) {
  // settle_rebates takes no args.
  return program.methods.settleRebates()
    .accountsPartial({
      transferAuthority: findTransferAuthorityAddress(program.programId)[0], perpetuals: findPerpetualsAddress(program.programId)[0], pool,
      rewardCustody,
      rewardCustodyOracleAccount,
      rewardCustodyTokenAccount,
      rebateVault: findRebateVaultAddress(program.programId)[0], rebateTokenAccount: findRebateTokenAccountAddress(program.programId)[0],
      tokenMint, tokenProgram: tp(opts.token22),
      eventAuthority: findEventAuthorityAddress(program.programId)[0], program: program.programId, ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    }).instruction();
}
