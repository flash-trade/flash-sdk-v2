import {
  Keypair,
  Message,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bs58 = require("bs58") as { decode: (s: string) => Uint8Array };

// =========================================================================
// MagicBlock ER wire-format primitives
// =========================================================================
//
// Three independent quirks make stock @solana/web3.js paths unusable for
// large ER transactions (Pool.0 mainnet: ~105 keys after 22 custodies + 22
// oracles + 42 markets are added as remaining accounts):
//
//   1. Message.serialize() allocates Buffer.alloc(2048) for the
//      header/keys/blockhash section — throws RangeError around 55+ keys.
//      `serializeMessageUnbounded` re-emits the same wire format with
//      shortvec + dynamic concat, no fixed buffer.
//
//   2. Transaction.serialize() enforces PACKET_DATA_SIZE = 1232. Callers
//      using `buildUnboundedLegacyTx` skip Transaction.serialize() entirely
//      and emit `[shortvec(sigCount), ...sigs, messageBytes]` themselves.
//
//   3. The MagicBlock ER aperture
//      (magicblock-aperture/src/requests/http/mod.rs:33) hard-checks every
//      instruction's program_id_index < 38 (1232 / 32). web3.js sorts
//      readonly-non-signer accounts by pubkey lexicographically, so with
//      100+ accounts the program lands well past that threshold.
//      `rebaseProgramIndices` swaps program slots into the lowest free
//      readonly-non-signer slot < 38 and rewrites every ix's
//      programIdIndex / accounts[] references. Header is preserved.
//
// Worth knowing: v0 + ALT does NOT work on this ER — the validator's
// sanitize path (magicblock-core/src/link/transactions.rs:218) hard-codes
// SimpleAddressLoader::Enabled(Default::default()), so any v0 tx that
// references LUT-resolved accounts fails with 0-CU NotEnoughAccountKeys.
// Legacy is the only working path today.

export const MAGICBLOCK_MAX_PROGRAM_ID_INDEX = 38; // exclusive upper bound

// =========================================================================
// Pluggable ed25519 signer (browser-safe by default)
// =========================================================================

export type Ed25519Signer = (
  message: Uint8Array,
  secretKey: Uint8Array
) => Uint8Array;

const NODE_ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex"
);

/**
 * Default Node-only signer. Uses crypto.sign(null, ...) on a PKCS#8-wrapped
 * 32-byte seed extracted from a Solana Keypair.secretKey. Lazily resolves
 * `crypto` so this module stays importable in the browser; browsers should
 * pass a tweetnacl-backed signer via `Ed25519Signer` instead.
 */
export const nodeEd25519Signer: Ed25519Signer = (message, secretKey) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createPrivateKey, sign } = require("crypto") as typeof import("crypto");
  const seed = secretKey.slice(0, 32);
  const pkcs8 = Buffer.concat([
    NODE_ED25519_PKCS8_PREFIX,
    Buffer.from(seed),
  ]);
  const key = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  return sign(null, Buffer.from(message), key);
};

// =========================================================================
// Wire encoding
// =========================================================================

export function encodeShortvec(n: number): Buffer {
  const out: number[] = [];
  let v = n >>> 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if ((v & ~0x7f) === 0) {
      out.push(v);
      break;
    }
    out.push((v & 0x7f) | 0x80);
    v = v >>> 7;
  }
  return Buffer.from(out);
}

/**
 * Wire-equivalent to `Message.serialize()` but with no fixed-size buffer.
 * Drop-in for any caller hitting RangeError on 55+ key txs.
 */
export function serializeMessageUnbounded(msg: Message): Buffer {
  const parts: Buffer[] = [
    Buffer.from([
      msg.header.numRequiredSignatures,
      msg.header.numReadonlySignedAccounts,
      msg.header.numReadonlyUnsignedAccounts,
    ]),
    encodeShortvec(msg.accountKeys.length),
  ];
  for (const k of msg.accountKeys) parts.push(k.toBuffer());
  parts.push(Buffer.from(bs58.decode(msg.recentBlockhash)));
  parts.push(encodeShortvec(msg.instructions.length));
  for (const ix of msg.instructions) {
    parts.push(Buffer.from([ix.programIdIndex]));
    parts.push(encodeShortvec(ix.accounts.length));
    parts.push(Buffer.from(ix.accounts));
    const data = Buffer.from(bs58.decode(ix.data));
    parts.push(encodeShortvec(data.length));
    parts.push(data);
  }
  return Buffer.concat(parts);
}

/**
 * Mutates `msg` so that every instruction's `programIdIndex` lies within
 * [0, MAGICBLOCK_MAX_PROGRAM_ID_INDEX). Swaps each offending program slot
 * with the lowest-numbered free slot in the readonly-non-signer section,
 * then rewrites all instruction references. Header is unchanged because
 * swaps stay within the readonly-non-signer band.
 *
 * No-op if all programs already satisfy the bound (the common case for
 * base-chain or small ER txs), so it's safe to call unconditionally.
 */
export function rebaseProgramIndices(msg: Message): void {
  const { header, accountKeys, instructions } = msg;
  const roNonSignerStart =
    accountKeys.length - header.numReadonlyUnsignedAccounts;

  const programIdxs = new Set<number>();
  for (const ix of instructions) programIdxs.add(ix.programIdIndex);
  const needsMove = [...programIdxs]
    .filter((i) => i >= MAGICBLOCK_MAX_PROGRAM_ID_INDEX)
    .sort((a, b) => a - b);
  if (needsMove.length === 0) return;

  const perm = new Map<number, number>();
  let nextLowSlot = roNonSignerStart;
  for (const pIdx of needsMove) {
    while (
      nextLowSlot < MAGICBLOCK_MAX_PROGRAM_ID_INDEX &&
      (programIdxs.has(nextLowSlot) || perm.has(nextLowSlot))
    ) {
      nextLowSlot++;
    }
    if (nextLowSlot >= MAGICBLOCK_MAX_PROGRAM_ID_INDEX) {
      throw new Error(
        `rebaseProgramIndices: exhausted readonly-non-signer slots < ${MAGICBLOCK_MAX_PROGRAM_ID_INDEX}; ` +
          `roNonSignerStart=${roNonSignerStart}, programs needing move=${needsMove.length}`
      );
    }
    perm.set(pIdx, nextLowSlot);
    perm.set(nextLowSlot, pIdx);
    nextLowSlot++;
  }

  for (const [from, to] of perm) {
    if (from < to) {
      const tmp = accountKeys[from];
      accountKeys[from] = accountKeys[to];
      accountKeys[to] = tmp;
    }
  }
  for (const ix of instructions) {
    if (perm.has(ix.programIdIndex)) {
      ix.programIdIndex = perm.get(ix.programIdIndex)!;
    }
    ix.accounts = ix.accounts.map((idx) =>
      perm.has(idx) ? perm.get(idx)! : idx
    );
  }
}

// =========================================================================
// Transaction builders
// =========================================================================

/**
 * Compile a Transaction to wire bytes using the unbounded path. Signs each
 * required signature with the matching Keypair from `signers` (looked up
 * by pubkey), via the supplied ed25519 signer (defaults to Node's crypto).
 *
 * Caller is responsible for setting `tx.recentBlockhash` and `tx.feePayer`
 * before calling.
 */
export function buildUnboundedLegacyTx(
  tx: Transaction,
  signers: Keypair[],
  signer: Ed25519Signer = nodeEd25519Signer
): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg = (tx as any)._compile() as Message;
  rebaseProgramIndices(msg);
  const messageBytes = serializeMessageUnbounded(msg);

  const signerByPubkey = new Map(
    signers.map((s) => [s.publicKey.toBase58(), s])
  );
  const sigs: Buffer[] = [];
  for (let i = 0; i < msg.header.numRequiredSignatures; i++) {
    const pk = msg.accountKeys[i].toBase58();
    const kp = signerByPubkey.get(pk);
    if (!kp) {
      throw new Error(
        `buildUnboundedLegacyTx: missing signer for required signature at index ${i}: ${pk}`
      );
    }
    const sig = signer(messageBytes, kp.secretKey);
    sigs.push(Buffer.from(sig));
  }

  const wire: Buffer[] = [encodeShortvec(sigs.length)];
  for (const s of sigs) wire.push(s);
  wire.push(messageBytes);
  return Buffer.concat(wire);
}

/**
 * Build the base64 wire bytes for a `simulateTransaction` RPC call against
 * the MagicBlock ER. No real signature — pair with `sigVerify: false` and
 * `replaceRecentBlockhash: true` on the simulate config.
 */
export function buildUnboundedSimulateBytes(
  tx: Transaction,
  feePayer?: PublicKey
): Buffer {
  if (feePayer) tx.feePayer = feePayer;
  if (!tx.feePayer) tx.feePayer = PublicKey.default;
  if (!tx.recentBlockhash) tx.recentBlockhash = PublicKey.default.toBase58();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg = (tx as any)._compile() as Message;
  rebaseProgramIndices(msg);
  const messageBytes = serializeMessageUnbounded(msg);

  return Buffer.concat([
    Buffer.from([1]),     // shortvec sig count
    Buffer.alloc(64),     // dummy zero signature
    messageBytes,
  ]);
}
