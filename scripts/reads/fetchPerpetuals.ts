import { main } from "../_lib";

// ts-node scripts/reads/fetchPerpetuals.ts
main(({ client }) => client.accounts.fetchPerpetuals());
