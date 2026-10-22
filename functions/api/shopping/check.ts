import { requestIdFor } from "../_lib/observability";
import { handleShoppingCheckUpdate, type ShoppingEnv } from "../_lib/shopping_handlers";
import { withSessionGuard } from '../_lib/state_session';

type Env = ShoppingEnv;

const handle = ({ request, env }: Parameters<PagesFunction<Env>>[0]) =>
  handleShoppingCheckUpdate({ request, env, requestId: requestIdFor(request) });

export const onRequestPatch: PagesFunction<Env> = async context =>
  withSessionGuard(await handle(context), context.request, 'Family');
export const onRequestPost: PagesFunction<Env> = onRequestPatch;
