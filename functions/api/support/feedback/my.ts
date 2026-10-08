import {
  handleMySupportGet,
  handleMySupportPost,
  type MySupportFeedbackEnv,
} from "../../_lib/support_feedback_my_handler";
import { logApiEvent, requestIdFor, withRequestId } from "../../_lib/observability";

type Env = MySupportFeedbackEnv;

/** Correlates support reads and replies without logging ticket content or attachments. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleMySupportGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("support.my.get.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleMySupportPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("support.my.post.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};
