import { json } from "../_lib/auth";
import {
  handleSupportGet,
  handleSupportPatch,
  handleSupportPost,
  type SupportFeedbackEnv,
} from "../_lib/support_feedback_handler";
import { logApiEvent, requestIdFor, withRequestId } from "../_lib/observability";

type Env = SupportFeedbackEnv;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let response: Response;
  try {
    response = await handleSupportPost(context);
  } catch {
    response = json({ error: "SERVER_ERROR", public_message: "Не удалось отправить обращение. Попробуйте ещё раз позже." }, 500);
  }
  const requestId = requestIdFor(context.request);
  logApiEvent("support.create.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};

/** Keeps support administration responses traceable without logging tickets or attachments. */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const response = await handleSupportPatch(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("support.admin.patch.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleSupportGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("support.admin.get.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};
