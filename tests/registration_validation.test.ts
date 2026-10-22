import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import RegistrationScreen, { type RegistrationData } from '../RegistrationScreen';
import { registrationError, registrationRisk } from '../registrationValidation';
import { ActivityLevel, Gender, Goal } from '../types';

const data: RegistrationData = { name: 'Synthetic', gender: Gender.MALE, weight: 70, height: 170, age: 30,
  activityLevel: ActivityLevel.MODERATELY_ACTIVE, goal: Goal.LOSS, targetWeight: 65, plan: 'free',
  dietary: { allergens: [], intolerances: [], excludedFoods: [], severity: 'strict', notes: '' },
  medicalRestrictions: '', bloodPressureSystolic: 0, bloodPressureDiastolic: 0, restingPulse: 0,
  bloodGlucoseMmolL: 0, waistCm: 0, chestCm: 0, hipsCm: 0 };
const screen = (regData: RegistrationData) => renderToStaticMarkup(React.createElement(RegistrationScreen, {
  regData, setRegData: vi.fn(), planError: null, isActivatingPlan: false, activationStep: 0,
  activationSteps: [], activationTotalMs: 3200, handleActivateWithTransition: vi.fn(), onOpenVersionInfo: vi.fn(),
}));
describe('registration validation', () => {
  it.each([1, 30, 130])('accepts supported integer age %s without silently changing it', age => {
    expect(registrationError({ ...data, age })).toBeNull();
  });
  it.each([999, 131, 0, -1, NaN, Infinity, 32.5])('explains invalid age %s before risk calculation', age => {
    expect(registrationError({ ...data, age })).toContain('возраст');
    expect(registrationRisk({ ...data, age })).toBeNull();
  });
  it('retains existing anthropometric and offset limits', () => {
    expect(registrationError({ ...data, weight: 0 })).toContain('вес');
    expect(registrationError({ ...data, height: 0 })).toContain('рост');
    expect(registrationError({ ...data, weight: 350, height: 120 })).toContain('сочетание');
    expect(registrationError({ ...data, lossDeficit: 1001 })).toContain('интенсивность');
  });
  it('requires acknowledgement for the selected goal only', () => {
    expect(registrationRisk({ ...data, lossDeficit: 1000, riskAckGain: true })?.acknowledged).toBe(false);
    expect(registrationRisk({ ...data, lossDeficit: 1000, riskAckLoss: true })?.acknowledged).toBe(true);
    expect(registrationRisk({ ...data, goal: Goal.GAIN, gainSurplus: 600, riskAckLoss: true })?.acknowledged).toBe(false);
  });
  it('renders age bounds, an inline explanation and a disabled create button for age999', () => {
    const html = screen({ ...data, age: 999 });
    expect(html).toContain('min="1" max="130" step="1"');
    expect(html).toContain('aria-label="Возраст" aria-invalid="true"');
    expect(html).toContain('Укажите возраст целым числом от 1 до 130 лет.');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Создать AI-план<\/button>/);
    expect(html).not.toContain('AI Инициализация');
  });
  it('makes risk acknowledgement reachable and keeps create disabled until confirmed', () => {
    const html = screen({ ...data, lossDeficit: 1000 });
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('Я понимаю риски выбранной интенсивности: 1000 ккал/день.');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Создать AI-план<\/button>/);
    expect(screen({ ...data, lossDeficit: 1000, riskAckLoss: true })).not.toMatch(/<button[^>]*disabled=""[^>]*>Создать AI-план<\/button>/);
  });
});
