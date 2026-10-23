import { isFamilyPlanningMenu, validateFamilyPlanningForProfiles, isPurchaseOnlyChange, deriveLegacyFamilyMenu } from '../../../domain/familyPlanning';
import { requireFamilyMember } from './family_access';
import { requireFamilyPlan } from './plans';
import { requireFamilyPlanning, readPlanningContext, OWNER_PLAN_SQL } from './family_dining';
import { readFamilyMenuState, type FamilyMenuWriteResult } from './family_menu_state';

export async function writeFamilyPlanningState(db:D1Database,userId:string,body:Record<string,unknown>):Promise<FamilyMenuWriteResult> {
 await requireFamilyPlanning(db);
 if(typeof body.familyId!=='string'||typeof body.weekStart!=='string'||!Number.isSafeInteger(body.baseVersion)||Number(body.baseVersion)<0
   ||(body.mutationKind!=='planning'&&body.mutationKind!=='purchases')||!isFamilyPlanningMenu(body.menu,body.weekStart)) return {kind:'invalid',error:'BAD_MENU'};
 const {familyId,weekStart}=body, menu=body.menu, baseVersion=Number(body.baseVersion), purchase=body.mutationKind==='purchases';
 const family=await requireFamilyMember(db,familyId,userId);
 await requireFamilyPlan(db,family.owner_user_id);
 if(!purchase&&family.owner_user_id!==userId) throw new Error('FORBIDDEN');
 const accepted=await readFamilyMenuState(db,userId,familyId,weekStart);
 if(accepted.version!==baseVersion) return {kind:'conflicted',snapshot:accepted};
 if(purchase) {
  if(!accepted.menu?.planningV1||!isPurchaseOnlyChange(accepted.menu.planningV1,menu.planningV1)) throw new Error('FORBIDDEN');
 } else {
  const context=await readPlanningContext(db,familyId);
  if(context.rosterVersion!==menu.planningV1.rosterVersion || Object.entries(menu.planningV1.profileVersions).some(([id,version])=>!context.profiles.some(p=>p.id===id&&p.version===version))) return {kind:'conflicted',snapshot:accepted};
  if(!validateFamilyPlanningForProfiles(menu,context)) throw new Error('INVALID_PLANNING');
 }
 const canonical=deriveLegacyFamilyMenu(menu.planningV1), json=JSON.stringify(canonical), now=Date.now();
 const authority=`EXISTS(SELECT 1 FROM families f JOIN family_members m ON m.family_id=f.id
  WHERE f.id=? AND f.is_active=1 AND m.user_id=? AND m.is_active=1 AND m.status='active' AND ${OWNER_PLAN_SQL}
  AND (?=1 OR (f.owner_user_id=? AND f.dining_roster_version=?)))`;
 const profiles=`(?=1 OR NOT EXISTS(SELECT 1 FROM json_each(?,'$.planningV1.profileVersions') v
  WHERE NOT EXISTS(SELECT 1 FROM family_dining_profiles p WHERE p.family_id=? AND p.id=v.key AND p.active=1 AND p.version=v.value
   AND (p.kind='managed' OR EXISTS(SELECT 1 FROM family_members m WHERE m.family_id=p.family_id AND m.user_id=p.user_id AND m.is_active=1 AND m.status='active')))))`;
 const result=await db.prepare(`INSERT INTO family_menu_generations(family_id,week_start,version,menu_json,created_by_user_id,updated_at)
  SELECT ?,?,1,?,?,? WHERE (?=0 OR EXISTS(SELECT 1 FROM family_menu_generations WHERE family_id=? AND week_start=?))
   AND ${authority} AND ${profiles}
  ON CONFLICT(family_id,week_start) DO UPDATE SET version=family_menu_generations.version+1,menu_json=excluded.menu_json,
   created_by_user_id=CASE WHEN ?=1 THEN family_menu_generations.created_by_user_id ELSE excluded.created_by_user_id END,updated_at=excluded.updated_at,
   legacy_menu_json=CASE WHEN family_menu_generations.legacy_menu_json IS NULL AND json_type(family_menu_generations.menu_json,'$.planningV1') IS NULL
    THEN family_menu_generations.menu_json ELSE family_menu_generations.legacy_menu_json END
  WHERE family_menu_generations.version=? AND family_menu_generations.version<9007199254740991
  RETURNING version`).bind(familyId,weekStart,json,userId,now,baseVersion,familyId,weekStart,
   familyId,userId,now,purchase?1:0,userId,menu.planningV1.rosterVersion,
   purchase?1:0,json,familyId,purchase?1:0,baseVersion).first<{version:number}>();
 if(!result) return {kind:'conflicted',snapshot:await readFamilyMenuState(db,userId,familyId,weekStart)};
 return {kind:'saved',weekStart,menuId:familyId+':'+weekStart,version:result.version,snapshot:{familyId,weekStart,version:result.version,menu:canonical}};
}

