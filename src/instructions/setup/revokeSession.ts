import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { SESSION_KEYS_PROGRAM_ID } from "../../constants";
import { findSessionTokenAddress, anchorDiscriminator } from "../../utils";

const REVOKE_SESSION_V2_DISCRIMINATOR = anchorDiscriminator("revoke_session_v2");

/**
 * Builds a `revoke_session_v2` instruction for the MagicBlock Session Keys program.
 *
 * Closes the session token PDA and returns rent to the fee_payer. Only the
 * authority can revoke active (non-expired) sessions; expired sessions can be
 * revoked by anyone to reclaim rent.
 */
export function revokeSession(
  authority: PublicKey,
  sessionSigner: PublicKey,
  targetProgram: PublicKey,
  feePayer?: PublicKey,
): TransactionInstruction {
  const payer = feePayer ?? authority;
  const [sessionToken] = findSessionTokenAddress(
    targetProgram,
    sessionSigner,
    authority,
  );

  return new TransactionInstruction({
    keys: [
      { pubkey: sessionToken, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: SESSION_KEYS_PROGRAM_ID,
    data: REVOKE_SESSION_V2_DISCRIMINATOR,
  });
}
