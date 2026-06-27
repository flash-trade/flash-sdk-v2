import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import {
  findEventAuthorityAddress,
  findPerpetualsAddress,
  findTradeVaultAddress,
  findTradeVaultTokenAccountAddress,
  findUserDepositLedgerAddress,
} from "../../utils";

/** deposit_direct — fund a user's deposit ledger by transferring into the
 *  per-mint trade vault. `depositor` pays the tokens; `owner` is credited. */
export async function depositDirect(
  program: Program,
  owner: PublicKey,
  tokenMint: PublicKey,
  depositorTokenAccount: PublicKey,
  amount: BN,
  depositor: PublicKey = program.provider.publicKey!,
  token22 = false,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [tradeVault] = findTradeVaultAddress(tokenMint, program.programId);
  const [tradeVaultTokenAccount] = findTradeVaultTokenAccountAddress(tokenMint, program.programId);
  const [userDepositLedger] = findUserDepositLedgerAddress(owner, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .depositDirect({ amount })
    .accountsPartial({
      depositor,
      owner,
      perpetuals,
      depositorTokenAccount,
      tokenMint,
      tradeVault,
      tradeVaultTokenAccount,
      userDepositLedger,
      tokenProgram: token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority,
      program: program.programId,
    })
    .instruction();
}
