import { main, ENV } from "../_lib";

// ts-node scripts/reads/fetchPool.ts
main(({ client }) => client.accounts.fetchPool(ENV.poolName));
