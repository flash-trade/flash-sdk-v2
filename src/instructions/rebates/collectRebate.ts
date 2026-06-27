import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findPerpetualsAddress,
  findTransferAuthorityAddress,
  findRebateVaultAddress,
  findRebateTokenAccountAddress,
  findTokenStakeAddress,
  findEventAuthorityAddress,
} from "../../utils";

const tp = (token22?: boolean) => (token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);

/** collect_rebate — a referrer/staker claims accrued rebate from the vault. */
export async function collectRebate(
  program: Program,
  receivingTokenMint: PublicKey,
  receivingTokenAccount: PublicKey,
  opts: { owner?: PublicKey; token22?: boolean } = {},
) {
  const owner = opts.owner ?? program.provider.publicKey!;
  // collect_rebate takes no args.
  return program.methods.collectRebate()
    .accountsPartial({
      owner, receivingTokenAccount, perpetuals: findPerpetualsAddress(program.programId)[0],
      transferAuthority: findTransferAuthorityAddress(program.programId)[0], rebateVault: findRebateVaultAddress(program.programId)[0],
      rebateTokenAccount: findRebateTokenAccountAddress(program.programId)[0], tokenStakeAccount: findTokenStakeAddress(owner, program.programId)[0],
      tokenProgram: tp(opts.token22), eventAuthority: findEventAuthorityAddress(program.programId)[0],
      program: program.programId, receivingTokenMint,
    }).instruction();
}
