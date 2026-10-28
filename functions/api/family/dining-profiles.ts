import { handlePlanning, type PlanningEnv } from '../_lib/family_planning_handler';
export const onRequestGet:PagesFunction<PlanningEnv>=context=>handlePlanning(context,'roster');
export const onRequestPost:PagesFunction<PlanningEnv>=context=>handlePlanning(context,'create');

