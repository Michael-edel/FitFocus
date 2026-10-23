import { handlePlanning, type PlanningEnv } from '../_lib/family_planning_handler';
export const onRequestGet:PagesFunction<PlanningEnv>=context=>handlePlanning(context,'private');
export const onRequestPatch:PagesFunction<PlanningEnv>=context=>handlePlanning(context,'patch');

