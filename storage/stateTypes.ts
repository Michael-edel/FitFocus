import type { CouncilResponse } from '../types';
export type CouncilChatMsg = {
  id: string; role: 'user' | 'assistant'; text: string; createdAt: string; response?: CouncilResponse;
};
export type FamilyMenuPrefs = {
  includeIds: string[]; cookingMode: 'all_meals' | 'once_per_day'; budgetPerWeek: string; currency: string;
};
