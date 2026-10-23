import { nowMs, uuid } from './db';
import { getActiveFamilyForUser } from './family_access';
import { asString, isJsonObject } from './json';
import { loadActivePlan } from './plans';

export function parseFamilyJoinCode(body:unknown):string {
 if(!isJsonObject(body)) throw new Error('BAD_REQUEST');
 const code=asString(body.code).toUpperCase();
 if(!code) throw new Error('BAD_REQUEST');
 return code;
}
/** The invite claim and membership/dining activation share one transaction. */
export async function joinFamilyByInvite({db,userId,body}:{db:D1Database;userId:string;body:unknown}):Promise<{familyId:string;alreadyMember?:boolean}> {
 const code=parseFamilyJoinCode(body), existing=await getActiveFamilyForUser(db,userId);
 if(existing) return {familyId:existing.id,alreadyMember:true};
 const invite=await db.prepare('SELECT i.family_id,f.owner_user_id FROM family_invites i JOIN families f ON f.id=i.family_id WHERE i.code=? AND i.used_by_user_id IS NULL AND i.expires_at>=? AND f.is_active=1').bind(code,Math.floor(nowMs()/1000)).first<{family_id:string;owner_user_id:string}>();
 if(!invite) throw new Error('INVITE_INVALID');
 if(await loadActivePlan(db,invite.owner_user_id)!=='family') throw new Error('FAMILY_PLAN_INACTIVE');
 const now=Math.floor(nowMs()/1000), memberId=uuid();
 await db.batch([
  db.prepare(`INSERT INTO family_members(id,family_id,user_id,role,status,is_active,created_at,updated_at)
   SELECT ?,i.family_id,?,'member','active',1,?,? FROM family_invites i JOIN families f ON f.id=i.family_id
   WHERE i.code=? AND i.family_id=? AND i.used_by_user_id IS NULL AND i.expires_at>=? AND f.is_active=1
   AND EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id=f.owner_user_id AND s.plan='family' AND s.status IN ('active','trialing') AND (s.current_period_end IS NULL OR s.current_period_end>?))
   AND (SELECT count(*) FROM family_members c WHERE c.family_id=i.family_id AND c.is_active=1 AND c.status='active')<5
   AND NOT EXISTS(SELECT 1 FROM family_members m JOIN families other ON other.id=m.family_id WHERE m.user_id=? AND m.is_active=1 AND m.status='active' AND other.is_active=1)
   ON CONFLICT(family_id,user_id) DO UPDATE SET id=excluded.id,status='active',is_active=1,updated_at=excluded.updated_at`)
   .bind(memberId,userId,now,now,code,invite.family_id,now,now*1000,userId),
  db.prepare("UPDATE family_invites SET used_by_user_id=?,used_at=? WHERE code=? AND used_by_user_id IS NULL AND EXISTS(SELECT 1 FROM family_members WHERE id=? AND user_id=? AND is_active=1 AND status='active')")
   .bind(userId,now,code,memberId,userId),
 ]);
 const accepted=await db.prepare("SELECT family_id FROM family_members WHERE id=? AND user_id=? AND is_active=1 AND status='active'").bind(memberId,userId).first<{family_id:string}>();
 if(accepted) return {familyId:accepted.family_id};
 const latest=await getActiveFamilyForUser(db,userId);
 if(latest) return {familyId:latest.id,alreadyMember:true};
 const count=await db.prepare("SELECT count(*) n FROM family_members WHERE family_id=? AND is_active=1 AND status='active'").bind(invite.family_id).first<{n:number}>();
 if(count && count.n>=5) throw new Error('FAMILY_LIMIT');
 throw new Error('INVITE_INVALID');
}
