import { BN, Program } from "@coral-xyz/anchor";
import { AccountMeta, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { findMultisigAddress, findPerpetualsAddress } from "../../utils";

const tp = (token22?: boolean) => (token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);

/** reimburse — admin: move tokens back into a custody (AUM tail = IncludePnl).
 *  `aumRemainingAccounts` is the AUM tail (custodies + oracles + markets). */
export async function reimburse(
  program: Program,
  pool: PublicKey,
  custody: PublicKey,
  custodyOracleAccount: PublicKey,
  custodyTokenAccount: PublicKey,
  fundingMint: PublicKey,
  fundingAccount: PublicKey,
  amountIn: BN,
  aumRemainingAccounts: AccountMeta[],
  opts: { admin?: PublicKey; token22?: boolean } = {},
) {
  return program.methods.reimburse({ amountIn })
    .accountsPartial({
      admin: opts.admin ?? program.provider.publicKey!, multisig: findMultisigAddress(program.programId)[0],
      fundingAccount, perpetuals: findPerpetualsAddress(program.programId)[0], pool,
      custody, custodyOracleAccount,
      custodyTokenAccount, tokenProgram: tp(opts.token22), program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY, fundingMint,
    })
    .remainingAccounts(aumRemainingAccounts).instruction();
}
