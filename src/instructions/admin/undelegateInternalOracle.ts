import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findInternalOracleAddress,
  findMultisigAddress,
} from "../../utils";

export async function undelegateInternalOracle(
  program: Program,
  custodyTokenMint: PublicKey,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [oracleAccount] = findInternalOracleAddress(custodyTokenMint, program.programId);

  return program.methods
    .undelegateInternalOracle({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      custodyTokenMint,
      oracleAccount,
    })
    .instruction();
}
