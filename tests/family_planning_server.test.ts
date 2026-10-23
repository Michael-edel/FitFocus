import { afterEach,beforeEach,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sqliteD1 } from './_helpers/sqliteD1';
import { readDiningRoster,readDiningPrivate,writeDiningProfile,readPlanningContext,familyPlanningReady } from '../functions/api/_lib/family_dining';
import { buildFamilyDayMenu,deriveLegacyFamilyMenu,type DiningProfileInput } from '../domain/familyPlanning';
import { writeFamilyMenuState,readFamilyMenuGeneration } from '../functions/api/_lib/family_menu_state';
import { previewFamilyDay } from '../functions/api/_lib/family_menu_generate';
import { readFamilyMenuArchive } from '../functions/api/_lib/family_planning_archive';
import { readActiveFamilyContext } from '../functions/api/_lib/family_read';
import { joinFamilyByInvite } from '../functions/api/_lib/family_join_by_invite';
import { createFamily } from '../functions/api/_lib/family_create';
import { updateShoppingCheck } from '../functions/api/_lib/shopping_checks';
import { readShoppingList } from '../functions/api/_lib/shopping_list';
import { buildUserDataExport } from '../functions/api/_lib/user_data_export';
import { softDeleteAccount } from '../functions/api/_lib/account_delete';

let f:ReturnType<typeof sqliteD1>;
const family='planning-family',owner='planning-owner',member='planning-member',day='2026-10-23';
const input=(name='Взрослый'):DiningProfileInput=>({displayName:name,ageGroup:'adult',goalContext:'MAINTAIN',portionShare:1,allergies:{state:'none',allergenIds:[]},hardExcludedIngredientIds:[],dislikedIngredientIds:[]});
function addUser(id:string){f.sqlite.prepare('INSERT INTO users(id,name,created_at) VALUES(?,?,1)').run(id,id===owner?'Алексей':'Участник');}
function addMember(id:string){addUser(id);f.sqlite.prepare("INSERT INTO family_members(id,family_id,user_id,role,status,is_active,created_at) VALUES(?,?,?,'member','active',1,1)").run('membership-'+id,family,id);}
async function configure(id=owner){
 const roster=await readDiningRoster(f.db,id,family),profile=await readDiningPrivate(f.db,id,family,id);
 return writeDiningProfile(f.db,id,{familyId:family,profileId:id,baseVersion:profile.version,baseRosterVersion:roster.rosterVersion,profile:input()},false);
}
async function menu(date=day){
 const context=await readPlanningContext(f.db,family);
 return buildFamilyDayMenu({...context,date,selections:[{slot:'breakfast',participantShares:{[owner]:1}}]});
}
async function save(value:Awaited<ReturnType<typeof menu>>,baseVersion=0,userId=owner,mutationKind='planning'){
 return writeFamilyMenuState(f.db,userId,{familyId:family,weekStart:value.weekStart,baseVersion,mutationKind,menu:value});
}
beforeEach(()=>{
 f=sqliteD1();addUser(owner);
 f.sqlite.prepare("INSERT INTO families(id,owner_user_id,name,created_at) VALUES(?,?,?,1)").run(family,owner,'Семья');
 f.sqlite.prepare("INSERT INTO family_members(id,family_id,user_id,role,status,is_active,created_at) VALUES(?,?,?,'owner','active',1,1)").run('owner-membership',family,owner);
 f.sqlite.prepare("INSERT INTO subscriptions(user_id,plan,status,updated_at) VALUES(?,'family','active',1)").run(owner);
});
afterEach(()=>f.sqlite.close());

it('initializes private configuration as null, displays name, and rejects foreign account private access',async()=>{
 addMember(member);
 expect(await readDiningPrivate(f.db,owner,family,owner)).toMatchObject({displayName:'Алексей',configuration:null});
 await expect(readDiningPrivate(f.db,owner,family,member)).rejects.toThrow('FORBIDDEN');
 f.sqlite.prepare("UPDATE family_members SET weight_kg=91,goal='LOSS',restrictions_json='secret' WHERE user_id=?").run(member);
 const context=await readActiveFamilyContext(f.db,owner);
 expect(context.members.find(p=>p.user_id===member)).not.toHaveProperty('weight_kg');
 expect(context.members.find(p=>p.user_id===member)).not.toHaveProperty('restrictions_json');
});
it('profile CAS increments its revision and roster and rejects stale base and child goal',async()=>{
 const first=await configure();
 expect(first).toMatchObject({rosterVersion:2,profile:{version:2,configuration:{ageGroup:'adult'}}});
 await expect(writeDiningProfile(f.db,owner,{familyId:family,profileId:owner,baseVersion:1,baseRosterVersion:1,profile:input()},false)).rejects.toThrow('VERSION_CONFLICT');
 await expect(writeDiningProfile(f.db,owner,{familyId:family,profileId:owner,baseVersion:2,baseRosterVersion:2,profile:{...input(),ageGroup:'child'}},false)).rejects.toThrow('BAD_PROFILE');
});
it('shares one five-person quota across managed and account join, leaving a failed invite unused',async()=>{
 for(let n=0;n<4;n++){const r=await readDiningRoster(f.db,owner,family);await writeDiningProfile(f.db,owner,{familyId:family,baseRosterVersion:r.rosterVersion,profile:input('Профиль '+n)},true);}
 addUser(member);f.sqlite.prepare("INSERT INTO family_invites(code,family_id,created_by_user_id,created_at,expires_at) VALUES('JOIN',?,?,1,99999999999)").run(family,owner);
 await expect(joinFamilyByInvite({db:f.db,userId:member,body:{code:'JOIN'}})).rejects.toThrow('FAMILY_LIMIT');
 expect(f.sqlite.prepare("SELECT used_by_user_id FROM family_invites WHERE code='JOIN'").get()?.used_by_user_id).toBeNull();
 expect((await readDiningRoster(f.db,owner,family)).profiles).toHaveLength(5);
});
it('joining atomically creates a null dining profile and consumes exactly its invite',async()=>{
 addUser(member);f.sqlite.prepare("INSERT INTO family_invites(code,family_id,created_by_user_id,created_at,expires_at) VALUES('JOIN',?,?,1,99999999999)").run(family,owner);
 expect(await joinFamilyByInvite({db:f.db,userId:member,body:{code:'JOIN'}})).toEqual({familyId:family});
 expect(await readDiningPrivate(f.db,member,family,member)).toMatchObject({configuration:null});
 expect(f.sqlite.prepare("SELECT used_by_user_id FROM family_invites WHERE code='JOIN'").get()?.used_by_user_id).toBe(member);
});
it('keeps the five-account join limit before 0022 and leaves the sixth invitation unconsumed',async()=>{
 f.sqlite.close();
 const baselineSchema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8').split('-- Dining profiles are private;')[0];
 f=sqliteD1(baselineSchema);addUser(owner);
 f.sqlite.prepare('INSERT INTO families(id,owner_user_id,name,created_at) VALUES(?,?,?,1)').run(family,owner,'Семья');
 f.sqlite.prepare("INSERT INTO family_members(id,family_id,user_id,role,status,is_active,created_at) VALUES(?,?,?,'owner','active',1,1)").run('owner-membership',family,owner);
 f.sqlite.prepare("INSERT INTO subscriptions(user_id,plan,status,updated_at) VALUES(?,'family','active',1)").run(owner);
 for(let n=0;n<4;n++)addMember('legacy-member-'+n);
 addUser(member);f.sqlite.prepare("INSERT INTO family_invites(code,family_id,created_by_user_id,created_at,expires_at) VALUES('JOIN',?,?,1,99999999999)").run(family,owner);
 await expect(joinFamilyByInvite({db:f.db,userId:member,body:{code:'JOIN'}})).rejects.toThrow('FAMILY_LIMIT');
 expect(f.sqlite.prepare('SELECT count(*) n FROM family_members').get()?.n).toBe(5);
 expect(f.sqlite.prepare("SELECT used_by_user_id FROM family_invites WHERE code='JOIN'").get()?.used_by_user_id).toBeNull();
});
it('rechecks capacity and roster when a concurrent account takes the last managed slot',async()=>{
 for(let n=0;n<3;n++){const roster=await readDiningRoster(f.db,owner,family);await writeDiningProfile(f.db,owner,{familyId:family,baseRosterVersion:roster.rosterVersion,profile:input('Управляемый '+n)},true);}
 const observed=await readDiningRoster(f.db,owner,family);let interleaved=false;
 f.hooks.before=sql=>{if(sql.startsWith('INSERT INTO family_dining_profiles')&&!interleaved){interleaved=true;addMember(member);}};
 await expect(writeDiningProfile(f.db,owner,{familyId:family,baseRosterVersion:observed.rosterVersion,profile:input('Последний')},true)).rejects.toThrow('VERSION_CONFLICT');
 f.hooks.before=undefined;expect((await readDiningRoster(f.db,owner,family)).profiles).toHaveLength(5);
});
it('does not consume an invite that expires immediately before the transactional join',async()=>{
 addUser(member);f.sqlite.prepare("INSERT INTO family_invites(code,family_id,created_by_user_id,created_at,expires_at) VALUES('JOIN',?,?,1,99999999999)").run(family,owner);
 f.hooks.before=sql=>{if(sql.startsWith('INSERT INTO family_members'))f.sqlite.prepare("UPDATE family_invites SET expires_at=1 WHERE code='JOIN'").run();};
 await expect(joinFamilyByInvite({db:f.db,userId:member,body:{code:'JOIN'}})).rejects.toThrow('INVITE_INVALID');
 expect(f.sqlite.prepare("SELECT used_by_user_id FROM family_invites WHERE code='JOIN'").get()?.used_by_user_id).toBeNull();
 expect(f.sqlite.prepare('SELECT count(*) n FROM family_dining_profiles').get()?.n).toBe(1);
});
it('rejects a whitespace family name before any family writes',async()=>{
 await expect(createFamily({db:f.db,userId:owner,body:{name:'   '}})).rejects.toThrow('BAD_NAME');
 expect(f.sqlite.prepare('SELECT count(*) n FROM families').get()?.n).toBe(1);
});
it('requires explicit configuration, produces an exact-date pure preview, and preserves canonical tables',async()=>{
 await expect(previewFamilyDay(f.db,owner,day,{preview:true,familyId:family,date:day,rosterVersion:1,selections:[{slot:'breakfast',participantShares:{[owner]:1}}]})).rejects.toThrow('PROFILE_INCOMPLETE');
 await configure();const r=await readDiningRoster(f.db,owner,family);
 const candidate=await previewFamilyDay(f.db,owner,day,{preview:true,familyId:family,date:day,rosterVersion:r.rosterVersion,selections:[{slot:'breakfast',participantShares:{[owner]:1}}]});
 expect(candidate.shared.menu.planningV1.date).toBe(day);
 expect(f.sqlite.prepare('SELECT count(*) n FROM family_menu_generations').get()?.n).toBe(0);
 expect(f.sqlite.prepare('SELECT planning_format_version n FROM families').get()?.n).toBe(0);
});
it('accepts member purchase-only CAS on owner entitlement and preserves owner authorship',async()=>{
 addMember(member);await configure();const planned=await menu();expect(await save(planned)).toMatchObject({kind:'saved',version:1});
 const updated=structuredClone(planned.planningV1);updated.purchasedQuantities[0].quantity=10;
 expect(await save(deriveLegacyFamilyMenu(updated),1,member,'purchases')).toMatchObject({kind:'saved',version:2});
 expect(f.sqlite.prepare('SELECT created_by_user_id FROM family_menu_generations').get()?.created_by_user_id).toBe(owner);
 const attack=structuredClone(updated);attack.meals[0].participantShares[owner]=1.25;
 await expect(save(deriveLegacyFamilyMenu(attack),2,member,'purchases')).rejects.toThrow('FORBIDDEN');
 await softDeleteAccount(f.db,member);
 expect((await readFamilyMenuGeneration(f.db,family,day)).version).toBe(2);
});
it('repeats membership and profile revisions inside SQL and preserves the accepted version on races',async()=>{
 addMember(member);await configure();const planned=await menu();await save(planned);
 const changed=structuredClone(planned.planningV1);changed.purchasedQuantities[0].quantity=1;
 f.hooks.before=sql=>{if(sql.startsWith('INSERT INTO family_menu_generations'))f.sqlite.prepare("UPDATE family_members SET is_active=0 WHERE user_id=?").run(member);};
 await expect(save(deriveLegacyFamilyMenu(changed),1,member,'purchases')).rejects.toThrow('FORBIDDEN');
 f.hooks.before=undefined;expect((await readFamilyMenuGeneration(f.db,family,day)).version).toBe(1);
 const candidate=await menu('2026-10-24');
 f.hooks.before=sql=>{if(sql.startsWith('INSERT INTO family_menu_generations'))f.sqlite.prepare("UPDATE family_dining_profiles SET version=version+1 WHERE family_id=? AND id=?").run(family,owner);};
 expect(await save(candidate)).toMatchObject({kind:'conflicted',snapshot:{version:0}});
});
it('preserves Monday legacy bytes/version, exposes safe archive, and blocks old writers on every date',async()=>{
 await configure();const monday='2026-10-19';
 const legacy={weekStart:monday,prefs:{includeIds:[owner],cookingMode:'all_meals',currency:'KZT',privateSecret:'hidden'},days:[],shoppingList:[],shoppingListItems:[],privateSecret:'hidden'};
 const raw=JSON.stringify(legacy);
 f.sqlite.prepare('INSERT INTO family_menu_generations(family_id,week_start,version,menu_json,created_by_user_id,updated_at) VALUES(?,?,7,?,?,1)').run(family,monday,raw,owner);
 const planned=await menu(monday);expect(await save(planned,7)).toMatchObject({kind:'saved',version:8});
 expect(f.sqlite.prepare('SELECT legacy_menu_json FROM family_menu_generations').get()?.legacy_menu_json).toBe(raw);
 expect(JSON.stringify(await readFamilyMenuArchive(f.db,owner,family))).not.toContain('privateSecret');
 expect(()=>f.sqlite.prepare('INSERT INTO family_menu_generations(family_id,week_start,version,menu_json,created_by_user_id,updated_at) VALUES(?,?,1,?,?,1)').run(family,'2026-10-26',raw,owner)).toThrow('FAMILY_PLANNING_STATE_REQUIRED');
 expect(()=>f.sqlite.prepare("UPDATE family_menu_generations SET legacy_menu_json='{}'").run()).toThrow('FAMILY_ARCHIVE_IMMUTABLE');
 expect(()=>f.sqlite.prepare('DELETE FROM family_menu_generations').run()).toThrow('FAMILY_PLANNING_STATE_REQUIRED');
});
it('does not activate the family format marker for a losing new-plan CAS',async()=>{
 await configure();const planned=await menu();expect(await save(planned,8)).toMatchObject({kind:'conflicted'});
 expect(f.sqlite.prepare('SELECT planning_format_version n FROM families').get()?.n).toBe(0);
});
it('rejects legacy checks/reads after planning and hides capability for a missing migration trigger',async()=>{
 await configure();await save(await menu());
 await expect(updateShoppingCheck({db:f.db,userId:owner,body:{family_id:family,week_start:day,ingredient:'Рис',checked:true}})).rejects.toThrow('FAMILY_PLANNING_STATE_REQUIRED');
 await expect(readShoppingList({db:f.db,userId:owner,familyId:family,weekStart:day})).rejects.toThrow('FAMILY_PLANNING_STATE_REQUIRED');
 expect(await familyPlanningReady(f.db)).toBe(true);
 f.sqlite.exec('DROP TRIGGER family_planning_marker_update');
 await expect(familyPlanningReady(f.db)).rejects.toThrow('FAMILY_PLANNING_MIGRATION_REQUIRED');
});
it('exports only self and managed private profiles and deletes owner dining and archive data',async()=>{
 addMember(member);await configure();await configure(member);
 const roster=await readDiningRoster(f.db,owner,family);
 await writeDiningProfile(f.db,owner,{familyId:family,baseRosterVersion:roster.rosterVersion,profile:input('Ребёнок')},true);
 await save(await menu());
 const result=await buildUserDataExport(f.db,{sub:owner,sid:'synthetic',roles:['user'],emailVerified:true});
 expect(result.family_dining_profiles).toHaveLength(2);
 expect(result.family_dining_profiles.some(row=>row.user_id===member)).toBe(false);
 await softDeleteAccount(f.db,owner);
 expect(f.sqlite.prepare('SELECT count(*) n FROM family_dining_profiles').get()?.n).toBe(0);
 expect(f.sqlite.prepare('SELECT count(*) n FROM family_menu_generations').get()?.n).toBe(0);
});

