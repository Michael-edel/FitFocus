import { requestIdFor } from "../_lib/observability";
import { handleShoppingListGet, type ShoppingEnv } from "../_lib/shopping_handlers";

type Env = ShoppingEnv;

export const onRequestGet: PagesFunction<Env> = ({ request, env }) =>
  handleShoppingListGet({ request, env, requestId: requestIdFor(request) });
