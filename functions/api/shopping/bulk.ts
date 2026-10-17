import { requestIdFor } from "../_lib/observability";
import { handleShoppingBulkPatch, type ShoppingEnv } from "../_lib/shopping_handlers";
import { withSessionGuard } from "../_lib/state_session";

type Env = ShoppingEnv;

export const onRequestPatch: PagesFunction<Env> = async context => {
  const response = await handleShoppingBulkPatch({
    request: context.request,
    env: context.env,
    requestId: requestIdFor(context.request),
  });
  return withSessionGuard(response, context.request, "Family");
};
