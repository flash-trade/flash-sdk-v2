import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { FlashPerpetualsClient, PoolConfig, PROGRAM_ID, Side } from "@flash_trade/flash-sdk-v2";
const pc = PoolConfig.fromIdsByName("Crypto.1", "mainnet-beta");
const provider = new AnchorProvider(new Connection("https://api.mainnet-beta.solana.com"), new Wallet(Keypair.generate()), {});
const client = new FlashPerpetualsClient(provider, undefined, PROGRAM_ID["mainnet-beta"], {});
const long = { long: {} } as unknown as Side;
const show = (label: string, lock: string) => {
  const m = client.findMarketConfig(pc, "SOL", lock, long);
  const col = pc.custodies.find((c) => c.custodyAccount.equals(m.collateralCustody))!;
  console.log(`${label.padEnd(34)} -> ${m.marketAccount.toBase58()} (${col.symbol})`);
};
// CLOSE / addCollateral path: pass the position's real collateral as-is
show("close legacy (pass WSOL)", "WSOL");
show("close new (pass JitoSOL)", "JitoSOL");
// OPEN path: lock symbol pre-resolved via resolveCollateralSymbol
show("OPEN (resolveCollateralSymbol)", client.resolveCollateralSymbol("SOL", "SOL", long));
