import { main } from "../_lib";

// ts-node scripts/views/getCompoundingTokenPrice.ts
main(({ client, poolConfig }) => client.views.getCompoundingTokenPrice(poolConfig));
