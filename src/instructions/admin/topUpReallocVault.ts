import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { InstructionResult } from "../../types";
import { delegateReallocVault } from "./delegateReallocVault";
import { undelegateReallocVault } from "./undelegateReallocVault";

/**
 * Two-step top-up of the delegated realloc vault. Send `undelegate` first,
 * WAIT for it to land (~1-2s blackout), then send `delegate`.
 */
export async function topUpReallocVault(
  program: Program,
  lamports: BN,
  admin?: PublicKey,
): Promise<{ undelegate: InstructionResult; delegate: InstructionResult }> {
  return {
    undelegate: {
      instructions: [await undelegateReallocVault(program, admin)],
      additionalSigners: [],
    },
    delegate: {
      instructions: [
        await delegateReallocVault(program, lamports, admin),
      ],
      additionalSigners: [],
    },
  };
}
