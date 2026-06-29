import "dotenv/config";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, AddressLookupTableAccount } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  FlashPerpetualsClient,
  PoolConfig,
  PROGRAM_ID,
  Side,
  validatorKeyForCluster,
  type Cluster,
  type CustodyConfig,
  type ContractOraclePrice,
} from "../src";

// ---------------------------------------------------------------------------
// Shared runner harness for the per-method scripts (app/-style). Each script
// under scripts/ imports `setup()` + `main()` from here, tweaks the inline
// CONFIG block, calls ONE client method, and prints the formatted result.
//
// Env (via .env or shell):
//   RPC_URL, ER_ENDPOINT, WALLET (or KEYPAIR_PATH), SESSION_KEY, CLUSTER, POOL
//   TARGET_SYMBOL, COLLATERAL_SYMBOL, plus per-amount overrides.
// ---------------------------------------------------------------------------

export const ENV = {
  cluster: (process.env.CLUSTER as Cluster) || "devnet",
  rpcUrl: process.env.RPC_URL || "https://api.devnet.solana.com",
  // MagicBlock validator RPC the devnet pool is delegated to (supports
  // simulateTransaction, needed by the views). The router can't simulate.
  erEndpoint: process.env.ER_ENDPOINT || "https://devnet-as.magicblock.app",
  walletPath:
    process.env.WALLET ||
    process.env.KEYPAIR_PATH ||
    path.join(os.homedir(), ".config/solana/id.json"),
  sessionKeyPath: process.env.SESSION_KEY || "",
  poolName: process.env.POOL || "Pool.0",
  targetSymbol: process.env.TARGET_SYMBOL || "SOL",
  collateralSymbol: process.env.COLLATERAL_SYMBOL || "USDC",
  slippageBps: new BN(process.env.SLIPPAGE_BPS || "100"),
  // ER delegation knobs — must match the validator the ER endpoint serves, else
  // the delegated receipt never appears on the ER. Mirrors the UI's
  // MB_DELEGATE_CONFIG (validatorKey + 10s commit frequency).
  commitFrequencyMs: Number(process.env.COMMIT_FREQUENCY || "10000"),
};

/** The MagicBlock validator the delegated receipts are bound to. Defaults to the
 *  per-cluster key (devnet → MAS1Dt9…) — overridable for a custom validator. */
export const validatorKey = (): PublicKey =>
  process.env.VALIDATOR_KEY
    ? new PublicKey(process.env.VALIDATOR_KEY)
    : validatorKeyForCluster(ENV.cluster);

/** Amount from env (base units) or a default. */
export const amount = (envVar: string, def: string) =>
  new BN(process.env[envVar] || def);

export function loadKeypair(file: string): Keypair {
  const resolved = file.startsWith("~")
    ? path.join(os.homedir(), file.slice(1))
    : file;
  const secret = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export interface Ctx {
  client: FlashPerpetualsClient;
  poolConfig: PoolConfig;
  wallet: Keypair;
  session: Keypair | null;
}

/** Build a fully-wired client from ENV. */
export function setup(): Ctx {
  const wallet = loadKeypair(ENV.walletPath);
  const session = ENV.sessionKeyPath ? loadKeypair(ENV.sessionKeyPath) : null;
  const connection = new Connection(ENV.rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(wallet), {
    commitment: "confirmed",
  });
  const poolConfig = PoolConfig.fromIdsByName(ENV.poolName, ENV.cluster);
  const client = new FlashPerpetualsClient(
    provider,
    undefined,
    PROGRAM_ID[ENV.cluster],
    { prioritizationFee: 5000 },
    ENV.erEndpoint,
  );
  return { client, poolConfig, wallet, session };
}

// --- config-resolution helpers (shared by the param-heavy runners) ----------

export function custodyBySymbol(pc: PoolConfig, symbol: string): CustodyConfig {
  const token = pc.getTokenFromSymbol(symbol);
  const custody = pc.custodies.find((c) => c.mintKey.equals(token.mintKey));
  if (!custody) throw new Error(`no custody for ${symbol}`);
  return custody;
}

/** Pick a real market for `targetSymbol` and derive its side + collateral.
 *  Prefers the market whose collateral custody matches COLLATERAL_SYMBOL —
 *  trades draw from the deposit ledger, which only holds what you deposited. */
export function pickMarket(pc: PoolConfig, targetSymbol = ENV.targetSymbol) {
  const target = custodyBySymbol(pc, targetSymbol);
  const wantCollateral = custodyBySymbol(pc, ENV.collateralSymbol);
  const candidates = pc.markets.filter((x) =>
    x.targetCustody.equals(target.custodyAccount),
  );
  const m =
    candidates.find((x) => x.collateralCustody.equals(wantCollateral.custodyAccount)) ??
    candidates[0];
  if (!m) throw new Error(`no market for ${targetSymbol}`);
  const collateral = pc.custodies.find((c) =>
    c.custodyAccount.equals(m.collateralCustody),
  )!;
  return {
    market: m.marketAccount,
    side: m.side as Side,
    collateralSymbol: collateral.symbol,
  };
}

/** Read the int oracle for `symbol` and return a slippage-bounded price. */
export async function entryPrice(
  ctx: Ctx,
  symbol: string,
  side: Side,
  isEntry = true,
): Promise<ContractOraclePrice> {
  const custody = custodyBySymbol(ctx.poolConfig, symbol);
  // Read the ER's delegated oracle copy — the base-layer one can lag and trip
  // the on-chain slippage check.
  const program = ctx.client.erProgram ?? ctx.client.program;
  const oracle = (await (program.account as any).customOracle.fetch(
    custody.intOracleAccount,
  )) as { price: BN; expo: number };
  return ctx.client.getPriceAfterSlippage(
    isEntry,
    ENV.slippageBps,
    { price: oracle.price, exponent: new BN(oracle.expo) },
    side,
  );
}

// --- phased debug logging ---------------------------------------------------
// Consistent step narration across the runner scripts. Each script is its own
// process, so a module-level counter restarts per run. Pattern mirrors
// scripts/lp/_pending.ts:  [phase N] <what>  /  • <detail>  /  ✓ <result>.

let _phase = 0;

/** Start the next phase with a one-line description. */
export const phase = (msg: string): void => {
  _phase += 1;
  console.log(`\n[phase ${_phase}] ${msg}`);
};
/** Sub-detail under the current phase. */
export const note = (msg: string): void => console.log(`  • ${msg}`);
/** Readable Side ({ long: {} } → "long") for log lines. */
export const sideName = (side: Side): string => Object.keys(side)[0] ?? String(side);
/** Success marker under the current phase. */
export const ok = (msg = "done"): void => console.log(`  ✓ ${msg}`);

/** Narrate a sendBase/sendEr result: dry-run count, or the tx's network/layer +
 *  signature + explorer URL. Returns the result so callers can `return logSent(...)`. */
export function logSent<T extends Record<string, any>>(sent: T): T {
  if ((sent as any).dryRun) {
    console.log(
      `  (dry-run) built ${(sent as any).instructionCount} instruction(s) — set SEND=1 to submit`,
    );
  } else if ((sent as any).signature) {
    console.log(`  ✓ ${(sent as any).layer} tx on ${(sent as any).network}: ${(sent as any).signature}`);
    console.log(`    ${(sent as any).explorer}`);
  }
  return sent;
}

// --- output -----------------------------------------------------------------

/** Pretty-print BN/PublicKey (ported from app/src/getOpenPositionQuote.ts). */
export const format = (value: any): any => {
  if (BN.isBN(value)) return value.toString();
  if (value instanceof PublicKey) return value.toBase58();
  if (Array.isArray(value)) return value.map(format);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = format(v);
    return out;
  }
  return value;
};

/** Explorer URL for a signature — always the Solana explorer. Base-layer txs use
 *  the standard cluster param; ER txs run on the MagicBlock validator RPC, so we
 *  point the explorer at that endpoint via its custom-cluster mode:
 *    - Solana explorer: mainnet is the default (omit), devnet needs `?cluster=devnet`.
 *    - ER txs: `?cluster=custom&customUrl=<ER RPC>` so the explorer queries the
 *      MagicBlock validator directly. */
export const txUrl = (signature: string, er = false) => {
  if (er) {
    const customUrl = encodeURIComponent(ENV.erEndpoint);
    return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${customUrl}`;
  }
  const suffix = ENV.cluster === "mainnet-beta" ? "" : `?cluster=${ENV.cluster}`;
  return `https://explorer.solana.com/tx/${signature}${suffix}`;
};

// --- sending (mutating runners) ---------------------------------------------
// Default to DRY-RUN: build the instructions and report, don't touch chain.
// Set SEND=1 to actually submit. Keeps `ts-node scripts/trade/openPosition.ts`
// safe to run for inspection.

/** SKIP_PREFLIGHT=0 forces an on-chain simulation before send (surfaces the
 *  error pre-flight). Default (unset / 1) skips it — matches the SDK default and
 *  is needed for the delegated `*_with_action` flows whose accounts the
 *  base-layer simulator can't resolve. */
export const skipPreflight = process.env.SKIP_PREFLIGHT !== "0";

/** Load the pool's address lookup tables. Compresses big base txs (e.g. the
 *  staked-LP `*_with_action` flows that forward the full AUM account set inline)
 *  under the 1232-byte legacy limit. Cached per process. */
let _alts: AddressLookupTableAccount[] | undefined;
export async function loadPoolAlts(ctx: Ctx): Promise<AddressLookupTableAccount[]> {
  if (_alts) return _alts;
  const addrs = (ctx.poolConfig as any).addressLookupTableAddresses as PublicKey[] | undefined;
  const conn = ctx.client.provider.connection;
  const out: AddressLookupTableAccount[] = [];
  for (const a of addrs ?? []) {
    const r = await conn.getAddressLookupTable(a).catch(() => null);
    if (r?.value) out.push(r.value);
  }
  _alts = out;
  return out;
}

export async function sendBase(
  ctx: Ctx,
  res: { instructions: any[]; additionalSigners?: any[] },
  opts: Record<string, any> = {},
) {
  if (process.env.SEND !== "1")
    return { dryRun: true, instructionCount: res.instructions.length };
  let signature: string;
  try {
    signature = await ctx.client.sendAndConfirmTransaction(res.instructions, {
      additionalSigners: res.additionalSigners,
      skipPreflight,
      // Attach the pool ALTs so large account sets fit the legacy tx limit.
      alts: await loadPoolAlts(ctx),
      // Caller overrides (e.g. prioritizationFee: 0 to drop the compute-price ix).
      ...opts,
    });
  } catch (e) {
    throw attachTxMeta(e, false);
  }
  return {
    signature,
    network: ENV.cluster,
    layer: "base-chain" as const,
    explorer: txUrl(signature),
  };
}

export async function sendEr(
  ctx: Ctx,
  res: { instructions: any[] },
  signers: Keypair[],
  opts: Record<string, any> = {},
) {
  if (process.env.SEND !== "1")
    return { dryRun: true, instructionCount: res.instructions.length };
  let result;
  try {
    result = await ctx.client.sendAndConfirmErTransaction(
      res.instructions,
      signers,
      // Caller overrides (e.g. computeUnitLimit: null to drop the CU-limit ix).
      opts,
    );
  } catch (e) {
    throw attachTxMeta(e, true);
  }
  return {
    signature: result.signature,
    network: ENV.cluster,
    layer: "ER" as const,
    explorer: txUrl(result.signature, true),
  };
}

// --- ER multi-phase driver (compounding LP) ---------------------------------
// The `*_with_action` base tx (queueErAction:false) only delegates the receipt.
// We then drive `_er` ourselves instead of relying on a keeper: poll the receipt
// onto the ER, send the `_er` commit with a throwaway payer, then wait for the
// base-layer settle to close the receipt. Mirrors flash-magic-ui's
// useLiquidityER.

/** The ER returns a zero-lamport AccountInfo for missing accounts (not null). */
const accountExists = (info: { lamports: number } | null): boolean =>
  info !== null && info.lamports > 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll until the delegated receipt is visible on the ER (or timeout). */
export async function pollVisibleOnEr(
  ctx: Ctx,
  address: PublicKey,
  timeoutMs = 30_000,
) {
  const conn = ctx.client.erConnection;
  if (!conn) throw new Error("ER not initialized (set ER_ENDPOINT)");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (accountExists(await conn.getAccountInfo(address).catch(() => null))) return;
    await sleep(1_000);
  }
  throw new Error(`Timeout: ER did not recognise receipt ${address.toBase58()}`);
}

/** Poll the base chain until the receipt closes (settle finished). */
export async function pollClosedOnBase(
  ctx: Ctx,
  address: PublicKey,
  timeoutMs = 60_000,
) {
  const conn = ctx.client.provider.connection;
  const deadline = Date.now() + timeoutMs;
  let seen = false;
  while (Date.now() < deadline) {
    const info = await conn.getAccountInfo(address).catch(() => null);
    if (accountExists(info)) seen = true;
    else if (seen) return; // existed, now gone → executed
    await sleep(3_000);
  }
  throw new Error(`Timeout waiting for receipt ${address.toBase58()} to close`);
}

// --- token balance snapshots (debugging) -----------------------------------
// Snapshot the token accounts a flow touches before/after so each script prints
// a clean "what moved" table — the fastest way to eyeball whether a deposit /
// withdraw / migrate actually settled (and by how much) or reverted (no change).

export interface BalanceSpec {
  label: string; // human label, e.g. "USDC (funding)"
  mint: PublicKey; // SPL mint
  owner?: PublicKey; // ATA owner (defaults to the loaded wallet)
  token2022?: boolean; // ATA is a Token-2022 account
}

/** Read one ATA's raw (base-unit) balance; 0n if the account doesn't exist. */
export async function readBalance(ctx: Ctx, spec: BalanceSpec): Promise<bigint> {
  const owner = spec.owner ?? ctx.wallet.publicKey;
  const ata = getAssociatedTokenAddressSync(
    spec.mint,
    owner,
    true,
    spec.token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
  );
  const info = await ctx.client.provider.connection
    .getTokenAccountBalance(ata)
    .catch(() => null);
  return info?.value ? BigInt(info.value.amount) : 0n;
}

/** Snapshot a set of balances keyed by label. */
export async function snapshotBalances(
  ctx: Ctx,
  specs: BalanceSpec[],
): Promise<Record<string, bigint>> {
  const out: Record<string, bigint> = {};
  for (const s of specs) out[s.label] = await readBalance(ctx, s);
  return out;
}

/** Print a before/after balance diff table (raw base units). */
export function printBalanceDiff(
  before: Record<string, bigint>,
  after: Record<string, bigint>,
): void {
  console.log("\nbalances (raw base units):");
  console.log(
    "  " +
      "token".padEnd(26) +
      "before".padStart(18) +
      "after".padStart(18) +
      "delta".padStart(18),
  );
  for (const label of Object.keys(before)) {
    const b = before[label] ?? 0n;
    const a = after[label] ?? 0n;
    const d = a - b;
    const ds = (d > 0n ? "+" : "") + d.toString();
    console.log(
      "  " +
        label.padEnd(26) +
        b.toString().padStart(18) +
        a.toString().padStart(18) +
        ds.padStart(18),
    );
  }
}

/** Snapshot `specs` before running `fn`, then print the before/after diff.
 *  Returns whatever `fn` returns. Wrap a script body to get a balance table. */
export async function withBalances<T>(
  ctx: Ctx,
  specs: BalanceSpec[],
  fn: () => Promise<T>,
): Promise<T> {
  const before = await snapshotBalances(ctx, specs);
  try {
    return await fn();
  } finally {
    const after = await snapshotBalances(ctx, specs);
    printBalanceDiff(before, after);
  }
}

/** Normalise a send/confirm error so the runner can always print a tx URL.
 *  Base-layer confirm errors embed the sig in the message ("(sig <sig>)") but
 *  don't set `.signature`; ER errors already carry `.signature` + `.isEr`. */
function attachTxMeta(e: any, isEr: boolean): any {
  if (!e || typeof e !== "object") return e;
  if (!e.signature) {
    const m = String(e.message ?? "").match(/\(sig ([1-9A-HJ-NP-Za-km-z]+)\)/);
    if (m) e.signature = m[1];
  }
  if (e.isEr === undefined) e.isEr = isEr;
  return e;
}

/** Run one async op, print its formatted result, exit. */
export function main(fn: (ctx: Ctx) => Promise<unknown>) {
  const ctx = setup();
  console.log(
    `[${ENV.cluster}] pool=${ENV.poolName} wallet=${ctx.wallet.publicKey.toBase58()}`,
  );
  fn(ctx)
    .then((r) => {
      if (r !== undefined) console.log(JSON.stringify(format(r), null, 2));
      process.exit(0);
    })
    .catch((e) => {
      console.error("ERROR:", e?.message ?? e);
      // Pull the sig out of `.signature` or the message ("(sig <sig>)") so the
      // tx URL is logged even on a failed tx that still landed on-chain.
      const sig =
        e?.signature ??
        String(e?.message ?? "").match(/\(sig ([1-9A-HJ-NP-Za-km-z]+)\)/)?.[1];
      if (sig) {
        const er = e?.isEr === true;
        console.error("network  :", ENV.cluster);
        console.error("layer    :", er ? "ER" : "base-chain");
        console.error("signature:", sig);
        console.error("explorer :", txUrl(sig, er));
      }
      if (e?.logs) console.error(e.logs.join("\n"));
      process.exit(1);
    });
}
