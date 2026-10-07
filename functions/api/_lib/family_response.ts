import { tracedJsonResponse } from './traced_response';

export type FamilyOperation =
  | 'family.read'
  | 'family.create'
  | 'family.member.update'
  | 'family.invite.create'
  | 'family.invite.join'
  | 'family.menu.read'
  | 'family.menu.save'
  | 'family.menu.generate';

/** Return a traceable family API response without putting request data into logs. */
export function familyResponse(
  operation: FamilyOperation,
  requestId: string,
  body: unknown,
  status: number,
): Response {
  return tracedJsonResponse(`${operation}.response`, requestId, body, status);
}
