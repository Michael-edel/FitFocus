import { requestIdFor } from "../_lib/observability";
import { handleShoppingCheckUpdate, type ShoppingEnv } from "../_lib/shopping_handlers";

type Env = ShoppingEnv;

const handle = ({ request, env }: Parameters<PagesFunction<Env>>[0]) =>
  handleShoppingCheckUpdate({ request, env, requestId: requestIdFor(request) });

export const onRequestPatch: PagesFunction<Env> = handle;
export const onRequestPost: PagesFunction<Env> = handle;
