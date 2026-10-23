import { isDiningProfileInput, type DiningPrivateProfile, type DiningCard, type FamilyRoster, type DiningProfileInput, type DiningPlanningProfile } from '../../../domain/familyPlanning';
import { FAMILY_INGREDIENTS } from '../../../domain/familyPlanningCatalog';
import { isRecord, parseJson } from '../../../safeJson';
import { requireFamilyMember } from './family_access';
import { requireFamilyPlan } from './plans';

const REQUIRED_TRIGGERS = ["family_members_identity","family_dining_capacity_insert","family_dining_capacity_update","family_dining_identity","family_dining_roster_insert","family_dining_roster_update","family_dining_roster_delete","family_roster_overflow","family_members_active_insert","family_members_active_update","family_members_dining_insert","family_members_dining_update","family_members_dining_delete","family_planning_plain_insert","family_planning_plain_update","family_planning_date_insert","family_planning_date_update","family_planning_archive_update","family_planning_marker_insert","family_planning_marker_update","family_planning_marker_persistent","family_planning_delete_guard","family_planning_checks_insert","family_planning_checks_update"];
export const OWNER_PLAN_SQL = "EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id=f.owner_user_id AND s.plan='family' AND s.status IN ('active','trialing') AND (s.current_period_end IS NULL OR s.current_period_end>?))";

export async function familyPlanningReady(db: D1Database | undefined): Promise<boolean> {
  if (!db) return false;
  const table = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='family_dining_profiles'").first();
  if (!table) return false;
  await db.prepare('SELECT dining_roster_version,planning_format_version FROM families LIMIT 0').all();
  await db.prepare('SELECT legacy_menu_json FROM family_menu_generations LIMIT 0').all();
  await db.prepare('SELECT family_id,id,kind,user_id,display_name,profile_json,version,active,created_at,updated_at FROM family_dining_profiles LIMIT 0').all();
  const rows = await db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all<{name:string}>();
  const required = [...REQUIRED_TRIGGERS,'family_menu_legacy_insert_block','family_menu_legacy_update_block','family_items_legacy_insert_block','family_items_legacy_update_block'];
  const indexes = await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_family_dining_active','idx_family_dining_account')").all<{name:string}>();
  if (!required.every(name=>rows.results?.some(row=>row.name===name)) || indexes.results?.length!==2) throw new Error('FAMILY_PLANNING_MIGRATION_REQUIRED');
  return true;
}
export async function requireFamilyPlanning(db:D1Database) {
  const ready=await familyPlanningReady(db).catch(()=>false);
  if (!ready) throw new Error('FAMILY_PLANNING_MIGRATION_REQUIRED');
}
type DiningRow = { family_id:string; id:string; kind:'account'|'managed'; user_id:string|null; display_name:string; profile_json:string|null; version:number; active:number };
function configuration(row:DiningRow): DiningProfileInput|null {
  if (row.profile_json===null) return null;
  const value=parseJson(row.profile_json);
  if (!isDiningProfileInput(value)) throw new Error('FAMILY_PROFILE_CORRUPT');
  return value;
}
function card(row:DiningRow,userId:string,ownerId:string):DiningCard {
  return {familyId:row.family_id,id:row.id,kind:row.kind,displayName:row.display_name,version:row.version,active:row.active===1,
    canEdit:row.kind==='account'?row.user_id===userId:ownerId===userId};
}
const DINING_ROWS_SQL="SELECT p.* FROM family_dining_profiles p WHERE p.family_id=? AND p.active=1 AND (p.kind='managed' OR EXISTS(SELECT 1 FROM family_members m WHERE m.family_id=p.family_id AND m.user_id=p.user_id AND m.is_active=1 AND m.status='active')) ORDER BY p.created_at,p.id";
const ROSTER_SQL='SELECT dining_roster_version FROM families WHERE id=? AND is_active=1';
export async function readDiningRows(db:D1Database,familyId:string):Promise<DiningRow[]> {
  const rows=await db.prepare(DINING_ROWS_SQL).bind(familyId).all<DiningRow>();
  return rows.results||[];
}
async function diningSnapshot(db:D1Database,familyId:string) {
  const result=await db.batch([db.prepare(ROSTER_SQL).bind(familyId),db.prepare(DINING_ROWS_SQL).bind(familyId)]);
  const family=result[0].results[0] as {dining_roster_version:number}|undefined;
  if(!family) throw new Error('FORBIDDEN');
  return {rosterVersion:family.dining_roster_version,rows:result[1].results as DiningRow[]};
}
export async function readPlanningContext(db:D1Database,familyId:string):Promise<{rosterVersion:number;profiles:DiningPlanningProfile[]}> {
  const snapshot=await diningSnapshot(db,familyId);
  return {rosterVersion:snapshot.rosterVersion,profiles:snapshot.rows.map(row=>({id:row.id,version:row.version,configuration:configuration(row)}))};
}
export async function readDiningRoster(db:D1Database,userId:string,familyId:string):Promise<FamilyRoster> {
  const family=await requireFamilyMember(db,familyId,userId);
  await requireFamilyPlan(db,family.owner_user_id);
  const snapshot=await diningSnapshot(db,familyId);
  return rosterFromRows(familyId,userId,family.owner_user_id,snapshot.rosterVersion,snapshot.rows);
}
function rosterFromRows(familyId:string,userId:string,ownerId:string,rosterVersion:number,rows:DiningRow[]):FamilyRoster {
  const blocked=new Set<string>(); let incomplete=false;
  for (const p of rows) {
    const c=configuration(p);
    if (!c || c.allergies.state==='unknown') incomplete=true;
    if (!c) continue;
    c.hardExcludedIngredientIds.forEach(id=>blocked.add(id));
    for (const ingredient of FAMILY_INGREDIENTS) if (ingredient.allergenIds.some(id=>c.allergies.allergenIds.includes(id))) blocked.add(ingredient.id);
  }
  return {familyId,rosterVersion,limit:5,profiles:rows.map(row=>card(row,userId,ownerId)),planningConstraints:{blockedIngredientIds:[...blocked].sort(),incomplete}};
}
export async function readDiningPrivate(db:D1Database,userId:string,familyId:string,profileId:string):Promise<DiningPrivateProfile> {
  const family=await requireFamilyMember(db,familyId,userId);
  await requireFamilyPlan(db,family.owner_user_id);
  const row=(await readDiningRows(db,familyId)).find(p=>p.id===profileId);
  if (!row || !card(row,userId,family.owner_user_id).canEdit) throw new Error('FORBIDDEN');
  return {...card(row,userId,family.owner_user_id),configuration:configuration(row)};
}
function version(value:unknown):value is number { return Number.isSafeInteger(value)&&Number(value)>=0; }
export async function writeDiningProfile(db:D1Database,userId:string,body:unknown,create:boolean) {
  if (!isRecord(body)||typeof body.familyId!=='string'||!body.familyId||!version(body.baseRosterVersion)||!isDiningProfileInput(body.profile)) throw new Error('BAD_PROFILE');
  if (!create && (typeof body.profileId!=='string'||!body.profileId||!version(body.baseVersion))) throw new Error('BAD_PROFILE');
  const family=await requireFamilyMember(db,body.familyId,userId);
  await requireFamilyPlan(db,family.owner_user_id);
  if (create && family.owner_user_id!==userId) throw new Error('FORBIDDEN');
  const id=create?'managed:'+crypto.randomUUID():String(body.profileId);
  if (!create) await readDiningPrivate(db,userId,body.familyId,id);
  const input=body.profile, now=Date.now(), json=JSON.stringify(input);
  const predicate="EXISTS(SELECT 1 FROM families f JOIN family_members m ON m.family_id=f.id WHERE f.id=? AND f.is_active=1 AND f.dining_roster_version=? AND m.user_id=? AND m.is_active=1 AND m.status='active' AND "+OWNER_PLAN_SQL+" AND ";
  const mutation=create
   ? db.prepare("INSERT INTO family_dining_profiles(family_id,id,kind,user_id,display_name,profile_json,version,active,created_at,updated_at) SELECT ?,?,'managed',NULL,?,?,1,1,?,? WHERE "+predicate+"f.owner_user_id=?) RETURNING *")
      .bind(body.familyId,id,input.displayName,json,now,now,body.familyId,body.baseRosterVersion,userId,now,userId)
   : db.prepare("UPDATE family_dining_profiles SET display_name=?,profile_json=?,version=version+1,updated_at=? WHERE family_id=? AND id=? AND version=? AND version<9007199254740991 AND active=1 AND "+predicate+"((family_dining_profiles.kind='account' AND family_dining_profiles.user_id=?) OR (family_dining_profiles.kind='managed' AND f.owner_user_id=?))) RETURNING *")
      .bind(input.displayName,json,now,body.familyId,id,body.baseVersion,body.familyId,body.baseRosterVersion,userId,now,userId,userId);
  const batch=await db.batch([mutation,db.prepare(ROSTER_SQL).bind(body.familyId),db.prepare(DINING_ROWS_SQL).bind(body.familyId)]);
  const result=batch[0].results[0] as DiningRow|undefined;
  if (!result) { await requireFamilyMember(db,body.familyId,userId); throw new Error('VERSION_CONFLICT'); }
  const rosterVersion=(batch[1].results[0] as {dining_roster_version:number}).dining_roster_version;
  const ack={ok:true,profile:{...card(result,userId,family.owner_user_id),configuration:configuration(result)},rosterVersion};
  return create?{...ack,roster:rosterFromRows(body.familyId,userId,family.owner_user_id,rosterVersion,batch[2].results as DiningRow[])}:ack;
}

