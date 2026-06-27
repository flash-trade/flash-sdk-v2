import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findMarketAddress,
  findMultisigAddress,
} from "../../utils";
import { Side } from "../../types";

export async function delegateMarket(
  program: Program,
  targetCustody: PublicKey,
  collateralCustody: PublicKey,
  side: Side,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);
  const [market] = findMarketAddress(
    targetCustody,
    collateralCustody,
    side,
    program.programId,
  );

  return program.methods
    .delegateMarket({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      eventAuthority,
      program: program.programId,
      targetCustody,
      collateralCustody,
      market,
    })
    .instruction();
}
