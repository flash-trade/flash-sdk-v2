import { main } from "../_lib";

// ts-node scripts/views/getLpTokenPrice.ts
main(({ client, poolConfig }) => client.views.getLpTokenPrice(poolConfig));
