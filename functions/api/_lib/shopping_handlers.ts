import { requireUser } from "./auth";
import { ensureUserRow, requireDB, toApiError } from "./db";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "./request_body";
import { updateShoppingCheck, updateShoppingChecks } from "./shopping_checks";
import { readShoppingList } from "./shopping_list";
import { tracedJsonResponse } from "./traced_response";

export type ShoppingEnv = { AUTH_JWT_SECRET?: string; DB?: D1Database };
type ShoppingRequest = { request: Request; env: ShoppingEnv; requestId: string };

function errorStatus(error: ReturnType<typeof toApiError>) {
  return error.code === "UNAUTH" ? 401 : error.code === "FORBIDDEN" ? 403 : error.code === "PLAN_REQUIRED_FAMILY" ? 402 : 400;
}

function failedResponse(event: string, requestId: string, error: unknown) {
  const apiError = toApiError(error);
  return tracedJsonResponse(event, requestId, { error: apiError }, errorStatus(apiError));
}

export async function handleShoppingListGet({ request, env, requestId }: ShoppingRequest): Promise<Response> {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);
    const url = new URL(request.url);
    const result = await readShoppingList({
      db,
      userId: user.sub,
      weekStart: String(url.searchParams.get("week") || ""),
      familyId: url.searchParams.get("family_id"),
    });
    if (result.kind === "invalid-week") return tracedJsonResponse("shopping.list.response", requestId, { error: "BAD_WEEK" }, 400);
    return tracedJsonResponse("shopping.list.response", requestId, {
      week_start: result.weekStart,
      ...(result.familyId ? { family_id: result.familyId } : {}),
      items: result.items,
      total_grams: result.totalGrams,
    }, 200);
  } catch (error) {
    return failedResponse("shopping.list.response", requestId, error);
  }
}

async function readShoppingBody(request: Request, event: string, requestId: string): Promise<unknown | Response> {
  try {
    return await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES) ?? {};
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return tracedJsonResponse(event, requestId, { error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw error;
  }
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export async function handleShoppingCheckUpdate({ request, env, requestId }: ShoppingRequest): Promise<Response> {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);
    const body = await readShoppingBody(request, "shopping.check.response", requestId);
    if (isResponse(body)) return body;
    const result = await updateShoppingCheck({ db, userId: user.sub, body });
    if (result.kind === "invalid") return tracedJsonResponse("shopping.check.response", requestId, { error: result.error }, 400);
    return tracedJsonResponse("shopping.check.response", requestId, {
      ok: true,
      week_start: result.weekStart,
      ingredient_name: result.ingredientName,
      checked: result.checked,
    }, 200);
  } catch (error) {
    return failedResponse("shopping.check.response", requestId, error);
  }
}

export async function handleShoppingBulkPatch({ request, env, requestId }: ShoppingRequest): Promise<Response> {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);
    await ensureUserRow(db, user);
    const body = await readShoppingBody(request, "shopping.bulk.response", requestId);
    if (isResponse(body)) return body;
    const result = await updateShoppingChecks({ db, userId: user.sub, body });
    if (result.kind === "invalid") return tracedJsonResponse("shopping.bulk.response", requestId, { error: result.error }, 400);
    return tracedJsonResponse("shopping.bulk.response", requestId, { ok: true, updated: result.updated, week_start: result.weekStart }, 200);
  } catch (error) {
    return failedResponse("shopping.bulk.response", requestId, error);
  }
}
