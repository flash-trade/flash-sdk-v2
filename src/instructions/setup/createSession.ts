import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import BN from "bn.js";
import { SESSION_KEYS_PROGRAM_ID } from "../../constants";
import { findSessionTokenAddress, anchorDiscriminator } from "../../utils";

const CREATE_SESSION_V2_DISCRIMINATOR = anchorDiscriminator("create_session_v2");

/**
 * Builds a `create_session_v2` instruction for the MagicBlock Session Keys program.
 *
 * Creates a V2 session token PDA that authorizes `sessionSigner` to act on behalf
 * of `authority` for the `targetProgram`. The session token expires at `validUntil`.
 *
 * Both `authority` and `sessionSigner` must sign the transaction.
 */
export function createSession(
  authority: PublicKey,
  sessionSigner: PublicKey,
  targetProgram: PublicKey,
  topUp: boolean = true,
  validUntil?: BN,
  feePayer?: PublicKey,
): TransactionInstruction {
  const payer = feePayer ?? authority;
  const [sessionToken] = findSessionTokenAddress(
    targetProgram,
    sessionSigner,
    authority,
  );

  // Encode args: top_up (Option<bool>), valid_until (Option<i64>), lamports (Option<u64>)
  const parts: Buffer[] = [CREATE_SESSION_V2_DISCRIMINATOR];

  // top_up: Option<bool>
  const topUpBuf = Buffer.alloc(2);
  topUpBuf.writeUInt8(1, 0); // Some
  topUpBuf.writeUInt8(topUp ? 1 : 0, 1);
  parts.push(topUpBuf);

  // valid_until: Option<i64>
  if (validUntil) {
    const vuBuf = Buffer.alloc(9);
    vuBuf.writeUInt8(1, 0); // Some
    validUntil.toArrayLike(Buffer, "le", 8).copy(vuBuf, 1);
    parts.push(vuBuf);
  } else {
    parts.push(Buffer.from([0])); // None
  }

  // lamports: Option<u64> — None (use default)
  parts.push(Buffer.from([0]));

  return new TransactionInstruction({
    keys: [
      { pubkey: sessionToken, isSigner: false, isWritable: true },
      { pubkey: sessionSigner, isSigner: true, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: targetProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: SESSION_KEYS_PROGRAM_ID,
    data: Buffer.concat(parts),
  });
}
