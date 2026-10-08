import { json, requireUser } from "./auth";
import { requireDB } from "./db";
import {
  readFormDataRequest,
  RequestBodyTooLargeError,
  SUPPORT_FORM_BODY_LIMIT_BYTES,
} from "./request_body";
import { type SupportAttachmentBucket } from "./support_attachments";
import {
  listMySupportTickets,
  readMySupportTicketDetail,
} from "./support_ticket_user_read";
import { replyToMySupportTicket } from "./support_ticket_user_reply";

export type MySupportFeedbackEnv = {
  DB: D1Database;
  AUTH_JWT_SECRET: string;
  SUPPORT_ATTACHMENTS?: SupportAttachmentBucket;
};

type MySupportFeedbackContext = Parameters<PagesFunction<MySupportFeedbackEnv>>[0];

export async function handleMySupportGet({ request, env }: MySupportFeedbackContext) {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const db = requireDB(env);
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();

  if (id) {
    const ticket = await readMySupportTicketDetail(db, user.sub, id);
    if (!ticket) return json({ error: "NOT_FOUND", message: "ticket not found" }, 404);
    return json({ ticket });
  }

  return json({ tickets: await listMySupportTickets(db, user.sub) });
}

export async function handleMySupportPost({ request, env }: MySupportFeedbackContext) {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const db = requireDB(env);
  let form: FormData | null = null;
  try {
    form = await readFormDataRequest(request, SUPPORT_FORM_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }
  if (!form) return json({ error: "BAD_REQUEST", message: "form data required" }, 400);

  const result = await replyToMySupportTicket({
    db,
    userId: user.sub,
    bucket: env.SUPPORT_ATTACHMENTS,
    form,
  });
  if (result.kind === "success") return json({ ok: true, ticket: result.ticket });
  if (result.kind === "not-found") return json({ error: "NOT_FOUND", message: "ticket not found" }, 404);
  if (result.kind === "closed") return json({ error: "BAD_REQUEST", message: "ticket closed" }, 400);
  return json({ error: "BAD_REQUEST", message: result.message }, 400);
}
