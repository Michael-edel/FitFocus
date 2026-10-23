import { isRecord, parseJson } from '../../../safeJson';
import type { FamilyWeeklyMenu } from '../../../types';
import { requireFamilyMember } from './family_access';
import { requireFamilyPlan } from './plans';

/** Whitelist legacy display structure. Stored bytes remain unchanged; arbitrary extras never leave the server. */
export function safeLegacyFamilyMenu(value:unknown,weekStart:string):FamilyWeeklyMenu {
 if(!isRecord(value)||!Array.isArray(value.days)||![0,7].includes(value.days.length)||!isRecord(value.prefs)) throw new Error('FAMILY_MENU_CORRUPT');
 const includeIds=Array.isArray(value.prefs.includeIds)?value.prefs.includeIds.filter((id):id is string=>typeof id==='string'):[];
 const meal=(value:unknown)=>{
  if(!isRecord(value)||typeof value.base!=='string'||!isRecord(value.portions)) throw new Error('FAMILY_MENU_CORRUPT');
  return {base:value.base,portions:Object.fromEntries(Object.entries(value.portions).filter(([id,v])=>includeIds.includes(id)&&typeof v==='string')) as Record<string,string>};
 };
 const days=value.days.map(day=>{
  if(!isRecord(day)||typeof day.day!=='string') throw new Error('FAMILY_MENU_CORRUPT');
  return {day:day.day,breakfast:meal(day.breakfast),lunch:meal(day.lunch),dinner:meal(day.dinner),snack:meal(day.snack)};
 });
 return {weekStart,prefs:{includeIds,cookingMode:'all_meals',currency:'KZT'},days,
  shoppingList:Array.isArray(value.shoppingList)?value.shoppingList.filter((v):v is string=>typeof v==='string'):[],
  shoppingListItems:Array.isArray(value.shoppingListItems)?value.shoppingListItems.flatMap(item=>isRecord(item)&&typeof item.name==='string'&&typeof item.grams==='number'&&Number.isFinite(item.grams)&&item.grams>=0?[{name:item.name,grams:item.grams}] : []):[]};
}
export async function readFamilyMenuArchive(db:D1Database,userId:string,familyId:string) {
 const family=await requireFamilyMember(db,familyId,userId); await requireFamilyPlan(db,family.owner_user_id);
 const rows=await db.prepare('SELECT week_start,menu_json,legacy_menu_json FROM family_menu_generations WHERE family_id=? ORDER BY week_start DESC').bind(familyId).all<{week_start:string;menu_json:string;legacy_menu_json:string|null}>();
 return (rows.results||[]).flatMap(row=>{
  const current=parseJson(row.menu_json), raw=row.legacy_menu_json??(isRecord(current)&&!('planningV1' in current)?row.menu_json:null);
  return raw===null?[]:[{familyId,periodStart:row.week_start,kind:'legacy-weekly' as const,menu:safeLegacyFamilyMenu(parseJson(raw),row.week_start)}];
 });
}

