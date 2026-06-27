import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findEventAuthorityAddress,
  findInternalOracleAddress,
  findMagicFeeVaultAddress,
  findMultisigAddress,
  findReallocVaultAddress,
} from "../../utils";
import { MAGICBLOCK_VALIDATOR_KEY } from "../../constants";

export interface SetInternalAccountConfigErParams {
  lazerFeedId: number;
}

// set_internal_account_config_er: ER variant of the config portion of
// add_internal_oracle. Updates lazer_feed_id on the delegated CustomOracle
// (["oracle_account", mint]) and commits it back to mainnet via #[commit].
// realloc_vault funds the sponsored commit; magic_fee_vault is the validator-
// scoped fee vault (not encoded in the IDL, so it is passed explicitly).
export async function setInternalAccountConfigEr(
  program: Program,
  custodyTokenMint: PublicKey,
  params: SetInternalAccountConfigErParams,
  admin?: PublicKey,
  validator: PublicKey = MAGICBLOCK_VALIDATOR_KEY.devnet,
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [intOracleAccount] = findInternalOracleAddress(custodyTokenMint, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [magicFeeVault] = findMagicFeeVaultAddress(validator);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .setInternalAccountConfigEr(params as any)
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      custodyTokenMint,
      intOracleAccount,
      reallocVault,
      magicFeeVault,
      eventAuthority,
      program: program.programId,
    })
    .instruction();
}
