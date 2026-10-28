import { requireScopedStateUser, withSessionGuard } from './state_session';
import { requireDB, toApiError } from './db';
import { requestIdFor } from './observability';
import { familyResponse } from './family_response';
import { readJsonRequest, RequestBodyTooLargeError } from './request_body';
import { requireFamilyPlanning, readDiningRoster, readDiningPrivate, writeDiningProfile } from './family_dining';
import { readFamilyMenuArchive } from './family_planning_archive';
export type PlanningEnv={AUTH_JWT_SECRET?:string;DB?:D1Database};
export function planningErrorStatus(code:string) {
 return ['UNAUTH','STATE_SESSION_CHANGED','STATE_SESSION_REQUIRED'].includes(code)?401:code==='FORBIDDEN'?403:code==='PLAN_REQUIRED_FAMILY'?402:
 code==='FAMILY_PLANNING_MIGRATION_REQUIRED'?503:['VERSION_CONFLICT','FAMILY_PLANNING_STATE_REQUIRED','FAMILY_LIMIT'].includes(code)?409:
 ['BAD_PROFILE','PROFILE_INCOMPLETE','ALLERGIES_UNKNOWN','UNKNOWN_CATALOG_ID','NO_SAFE_RECIPE','INVALID_PLANNING','BAD_SELECTION'].includes(code)?422:400;
}
export async function handlePlanning(context:Parameters<PagesFunction<PlanningEnv>>[0],action:'roster'|'private'|'create'|'patch'|'archive'):Promise<Response> {
 const {request,env}=context, requestId=requestIdFor(request);
 const operation=`family.planning.${action}` as const;
 let response:Response;
 try {
  const user=await requireScopedStateUser(request,env), db=requireDB(env); await requireFamilyPlanning(db);
  const url=new URL(request.url), familyId=url.searchParams.get('familyId'), profileId=url.searchParams.get('profileId');
  let body:unknown;
  if(action==='create'||action==='patch') body=await writeDiningProfile(db,user.sub,await readJsonRequest(request,16*1024),action==='create');
  else {
   if(!familyId || (action==='private'&&!profileId)) throw new Error('BAD_TARGET');
   body=action==='roster'?{roster:await readDiningRoster(db,user.sub,familyId)}:action==='private'?{profile:await readDiningPrivate(db,user.sub,familyId,profileId!)}:{items:await readFamilyMenuArchive(db,user.sub,familyId)};
  }
  response=familyResponse(operation,requestId,body,action==='create'?201:200);
 } catch(error) {
  const apiError=toApiError(error);
  response=familyResponse(operation,requestId,{error:apiError},error instanceof RequestBodyTooLargeError?413:planningErrorStatus(apiError.code));
 }
 return withSessionGuard(response,request,'Family');
}

