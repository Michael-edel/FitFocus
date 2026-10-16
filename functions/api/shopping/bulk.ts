import { requestIdFor } from "../_lib/observability";
import { handleShoppingBulkPatch, type ShoppingEnv } from "../_lib/shopping_handlers";

type Env = ShoppingEnv;

export const onRequestPatch: PagesFunction<Env> = ({ request, env }) =>
  handleShoppingBulkPatch({ request, env, requestId: requestIdFor(request) });
