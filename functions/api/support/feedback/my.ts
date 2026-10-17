import {
  handleMySupportGet,
  handleMySupportPost,
  type MySupportFeedbackEnv,
} from "../../_lib/support_feedback_my_handler";
import { logApiEvent, requestIdFor, withRequestId } from "../../_lib/observability";
import { withSessionGuard } from "../../_lib/state_session";

type Env = MySupportFeedbackEnv;

/** Correlates support reads and replies without logging ticket content or attachments. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleMySupportGet(context);
  const guarded = response.status === 401 ? response : withSessionGuard(response, context.request, "Support");
  const requestId = requestIdFor(context.request);
  logApiEvent("support.my.get.response", { requestId, status: response.status });
  return withRequestId(guarded, requestId);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleMySupportPost(context);
  const guarded = response.status === 401 ? response : withSessionGuard(response, context.request, "Support");
  const requestId = requestIdFor(context.request);
  logApiEvent("support.my.post.response", { requestId, status: response.status });
  return withRequestId(guarded, requestId);
};
