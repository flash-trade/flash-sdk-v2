import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { findInternalOracleAddress, findMultisigAddress } from "../../utils";

// add_internal_oracle: creates (init_if_needed) the singleton CustomOracle PDA
// ["oracle_account", mint] for a custody, wiring its price exponent + Pyth-Lazer
// feed id. This is the int_oracle_account the custody reads; on the ER it's fed
// by the lazer keeper (no manual set_custom_oracle_price needed).
export async function addInternalOracle(
  program: Program,
  custodyTokenMint: PublicKey,
  expo: number,
  lazerFeedId: number,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [intOracleAccount] = findInternalOracleAddress(custodyTokenMint, program.programId);

  return program.methods
    .addInternalOracle({ expo, lazerFeedId })
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      custodyTokenMint,
      intOracleAccount,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
}
