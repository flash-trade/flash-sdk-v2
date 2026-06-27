import {
  PublicKey,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  Transaction,
  AddressLookupTableAccount,
  Connection,
} from "@solana/web3.js";
import { decode } from "@coral-xyz/anchor/dist/cjs/utils/bytes/base64";
import { IdlCoder } from "./utils/IdlCoder";
import { buildUnboundedSimulateBytes } from "./utils/erWire";

/**
 * ViewHelper handles transaction simulation and return-value decoding
 * for read-only "view" instructions (getOpenPositionQuote, etc.).
 *
 * Pattern: build a transaction from a view instruction, simulate it
 * (without signing), and decode the return data from program logs.
 */
export class ViewHelper {
  private connection: Connection;
  private programId: PublicKey;
  private idl: any;

  constructor(connection: Connection, programId: PublicKey, idl: any) {
    this.connection = connection;
    this.programId = programId;
    this.idl = idl;
  }

  /**
   * Decode the return value from a simulated transaction's logs.
   *
   * @param data - The simulation result
   * @param instructionNumber - Index into IDL.instructions for the return type
   * @param instructionName - Name for error messages
   */
  decodeLogs<T>(
    data: RpcResponseAndContext<SimulatedTransactionResponse>,
    instructionNumber: number,
    instructionName = ""
  ): T | undefined {
    try {
      const returnPrefix = `Program return: ${this.programId.toBase58()} `;
      if (data.value.logs && data.value.err === null) {
        const returnLog = data.value.logs.find((l: any) =>
          l.startsWith(returnPrefix)
        );
        if (!returnLog) {
          this.logSimFailure(
            `${instructionName}: no "Program return:" log emitted`,
            data
          );
          throw new Error("View expected return log");
        }
        const returnData = decode(returnLog.slice(returnPrefix.length));
        const returnType = this.idl.instructions[instructionNumber]?.returns;

        if (!returnType) {
          throw new Error("View expected return type");
        }
        const coder = IdlCoder.fieldLayout(
          { type: returnType as any },
          Array.from([
            ...(this.idl.accounts ?? []),
            ...(this.idl.types ?? []),
          ]) as any
        );
        return coder.decode(returnData);
      } else {
        this.logSimFailure(
          `${instructionName}: simulation returned err or no logs`,
          data
        );
        throw new Error(`No Logs Found for ${instructionName}`);
      }
    } catch (error) {
      console.log(`[ViewHelper] decode error (${instructionName})::`, error);
      return undefined;
    }
  }

  /**
   * Centralised dump for any sim that didn't yield the expected return data.
   * Walks every program log, every program-data event, the on-chain error
   * (if any), and the unitsConsumed so callers can diagnose at a glance.
   */
  private logSimFailure(
    label: string,
    data: RpcResponseAndContext<SimulatedTransactionResponse>
  ): void {
    const v = data.value;
    console.group(`[ViewHelper] sim failed — ${label}`);
    console.log("programId   :", this.programId.toBase58());
    console.log("err         :", v.err);
    console.log("unitsConsumed:", v.unitsConsumed);
    console.log("returnData  :", (v as any).returnData ?? null);
    if (v.logs?.length) {
      console.groupCollapsed(`logs (${v.logs.length})`);
      v.logs.forEach((l: string, i: number) => console.log(`${String(i).padStart(3)} ${l}`));
      console.groupEnd();
    } else {
      console.log("logs        : <empty>");
    }
    if ((v as any).accounts) console.log("accounts    :", (v as any).accounts);
    console.groupEnd();
  }

  /**
   * Simulate a transaction without signing. Uses replaceRecentBlockhash so
   * the caller doesn't need a valid blockhash.
   *
   * Built on `buildUnboundedSimulateBytes`, which (a) skips web3.js's
   * 2048-byte Message.serialize() buffer so 55+ key view ixs work, and
   * (b) calls rebaseProgramIndices so the message satisfies the MagicBlock
   * ER aperture's `programIdIndex < 38` requirement. Both are no-ops for
   * small base-chain views, so this method is safe to use against any
   * Connection.
   *
   * `_addressLookupTableAccounts` is accepted for backwards compatibility
   * but ignored — v0 + ALT is not supported by the MagicBlock ER.
   */
  async simulateTransaction(
    transaction: Transaction,
    _addressLookupTableAccounts: AddressLookupTableAccount[] = [],
    userPublicKey?: PublicKey,
    enableLogging = false
  ): Promise<RpcResponseAndContext<SimulatedTransactionResponse>> {
    const rawTx = buildUnboundedSimulateBytes(transaction, userPublicKey);
    const base64Tx = rawTx.toString("base64");

    const config = {
      encoding: "base64",
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: this.connection.commitment,
    };
    // @ts-ignore - _rpcRequest is internal but stable in @solana/web3.js
    const resp = await (this.connection as any)._rpcRequest(
      "simulateTransaction",
      [base64Tx, config]
    );
    if (resp.error) {
      console.error("[ViewHelper] simulateTransaction RPC error:", resp.error);
      throw new Error(
        `failed to simulate transaction: ${resp.error.message}`
      );
    }
    const result = resp.result as RpcResponseAndContext<SimulatedTransactionResponse>;
    const v = result.value;
    const logCount = v.logs?.length ?? 0;
    const hasReturn = v.logs?.some((l: string) =>
      l.startsWith(`Program return: ${this.programId.toBase58()} `)
    );
    if (enableLogging) {
      console.log(
        `[ViewHelper] sim ${v.err ? "ERR" : hasReturn ? "ok" : "no-return"}: ` +
          `endpoint=${this.connection.rpcEndpoint} bytes=${rawTx.length} ` +
          `cu=${v.unitsConsumed ?? "?"} logs=${logCount} err=${JSON.stringify(v.err)}`
      );
    } 
    return result;
  }

  /**
   * Decode a CPI event log from a simulated transaction's logs.
   *
   * Anchor emits events as "Program data: <base64>" log lines where the
   * first 8 bytes are the event discriminator.
   *
   * @param data - The simulation result
   * @param eventName - Name of the event in the IDL (camelCase)
   */
  decodeEventLog<T>(
    data: RpcResponseAndContext<SimulatedTransactionResponse>,
    eventName: string
  ): T | undefined {
    try {
      const dataPrefix = "Program data: ";
      if (data.value.logs && data.value.err === null) {
        const nameLower = eventName.toLowerCase();
        const event = (this.idl.events ?? []).find((e: any) => e.name.toLowerCase() === nameLower);
        if (!event) throw new Error(`Event not found in IDL: ${eventName}`);
        const discriminator: number[] = event.discriminator;

        const typeDef = [...(this.idl.types ?? [])].find((t: any) => t.name.toLowerCase() === nameLower);
        if (!typeDef) throw new Error(`Event type not found in IDL: ${eventName}`);

        for (const log of data.value.logs) {
          if (!log.startsWith(dataPrefix)) continue;
          const rawData = decode(log.slice(dataPrefix.length));
          if (rawData.length < 8) continue;
          const matches = discriminator.every((b, i) => b === rawData[i]);
          if (!matches) continue;
          const payload = rawData.slice(8);
          const coder = IdlCoder.typeDefLayout(
            typeDef as any,
            Array.from([
              ...(this.idl.accounts ?? []),
              ...(this.idl.types ?? []),
            ]) as any
          );
          return coder.decode(payload);
        }
        this.logSimFailure(
          `event "${eventName}": no matching event log found`,
          data
        );
        throw new Error(`Event log not found for: ${eventName}`);
      } else {
        this.logSimFailure(
          `event "${eventName}": simulation returned err or no logs`,
          data
        );
        throw new Error(`No Logs Found for ${eventName}`);
      }
    } catch (error) {
      console.log(`[ViewHelper] decodeEventLog error (${eventName})::`, error);
      return undefined;
    }
  }

  /**
   * Decode the return value from a simulated transaction using a manually-provided
   * type definition. Use this for instructions that return data but whose IDL
   * doesn't declare a `returns` field.
   */
  decodeReturnWithTypedef<T>(
    data: RpcResponseAndContext<SimulatedTransactionResponse>,
    typeDef: any
  ): T | undefined {
    const label = (typeDef && (typeDef.name || JSON.stringify(typeDef))) ?? "<typedef>";
    try {
      const returnPrefix = `Program return: ${this.programId.toBase58()} `;
      if (data.value.logs && data.value.err === null) {
        const returnLog = data.value.logs.find((l: any) => l.startsWith(returnPrefix));
        if (!returnLog) {
          this.logSimFailure(
            `${label}: no "Program return:" log emitted`,
            data
          );
          throw new Error("No Program return log found");
        }
        const returnData = decode(returnLog.slice(returnPrefix.length));
        const coder = IdlCoder.typeDefLayout(
          typeDef,
          Array.from([
            ...(this.idl.accounts ?? []),
            ...(this.idl.types ?? []),
          ]) as any
        );
        return coder.decode(returnData);
      } else {
        this.logSimFailure(
          `${label}: simulation failed or no logs`,
          data
        );
        throw new Error("Simulation failed or no logs");
      }
    } catch (error) {
      console.log(`[ViewHelper] decodeReturnWithTypedef error (${label})::`, error);
      return undefined;
    }
  }

  /**
   * Find the instruction index in the IDL by name.
   * Handles both camelCase (local IDL) and snake_case (on-chain IDL) names.
   */
  findInstructionIndex(name: string): number {
    const snakeName = name.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
    const index = this.idl.instructions.findIndex(
      (f: any) => f.name === name || f.name === snakeName
    );
    if (index === -1) {
      throw new Error(`Instruction not found in IDL: ${name} (also tried: ${snakeName})`);
    }
    return index;
  }
}
