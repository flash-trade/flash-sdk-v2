import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findInternalOracleAddress,
  findMultisigAddress,
} from "../../utils";

export async function delegateInternalOracle(
  program: Program,
  custodyTokenMint: PublicKey,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);
  const [oracleAccount] = findInternalOracleAddress(custodyTokenMint, program.programId);

  return program.methods
    .delegateInternalOracle({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      eventAuthority,
      program: program.programId,
      custodyTokenMint,
      oracleAccount,
    })
    .instruction();
}
