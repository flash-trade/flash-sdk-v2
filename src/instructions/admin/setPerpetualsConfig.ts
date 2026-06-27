import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { findMultisigAddress, findPerpetualsAddress } from "../../utils";

export interface SetPerpetualsConfigParams {
  allowUngatedTrading: boolean;
  tradingDiscount: BN[];
  referralRebate: BN[];
  defaultRebate: BN;
  voltageMultiplier: any;
  tradeLimit: number;
  triggerOrderLimit: number;
  rebateLimitUsd: number;
}

export async function setPerpetualsConfig(
  program: Program,
  params: SetPerpetualsConfigParams,
  admin?: PublicKey,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);

  return program.methods
    .setPerpetualsConfig(params)
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      perpetuals,
    })
    .instruction();
}
