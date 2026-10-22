import { requestIdFor } from "../_lib/observability";
import { handleShoppingListGet, type ShoppingEnv } from "../_lib/shopping_handlers";
import { withSessionGuard } from '../_lib/state_session';

type Env = ShoppingEnv;

const handle: PagesFunction<Env> = ({ request, env }) =>
  handleShoppingListGet({ request, env, requestId: requestIdFor(request) });

export const onRequestGet: PagesFunction<Env> = async context =>
  withSessionGuard(await handle(context), context.request, 'Family');
