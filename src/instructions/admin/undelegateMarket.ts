import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { findMarketAddress, findMultisigAddress } from "../../utils";
import { Side } from "../../types";

export async function undelegateMarket(
  program: Program,
  targetCustody: PublicKey,
  collateralCustody: PublicKey,
  side: Side,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [market] = findMarketAddress(
    targetCustody,
    collateralCustody,
    side,
    program.programId,
  );

  return program.methods
    .undelegateMarket({})
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      targetCustody,
      collateralCustody,
      market,
    })
    .instruction();
}
