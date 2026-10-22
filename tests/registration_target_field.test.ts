import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import RegistrationScreen, { type RegistrationData } from '../RegistrationScreen';
import { ActivityLevel, Gender, Goal } from '../types';

const data: RegistrationData = {
  name: 'Synthetic', gender: Gender.MALE, weight: 70, height: 170, age: 30,
  activityLevel: ActivityLevel.MODERATELY_ACTIVE, goal: Goal.LOSS, targetWeight: 65, plan: 'free',
  dietary: { allergens: [], intolerances: [], excludedFoods: [], severity: 'strict', notes: '' },
  medicalRestrictions: '', bloodPressureSystolic: 0, bloodPressureDiastolic: 0, restingPulse: 0,
  bloodGlucoseMmolL: 0, waistCm: 0, chestCm: 0, hipsCm: 0,
};
function props(regData = data) {
  return { regData, setRegData: vi.fn(), planError: null, isActivatingPlan: false, activationStep: 0,
    activationSteps: [], activationTotalMs: 3200, handleActivateWithTransition: vi.fn(), onOpenVersionInfo: vi.fn() };
}
type FieldProps = { id?: string; children?: React.ReactNode; onChange?: (event: { target: { value: string } }) => void };
function targetInput(tree: React.ReactNode): React.ReactElement<FieldProps> | undefined {
  for (const child of React.Children.toArray(tree)) {
    if (!React.isValidElement<FieldProps>(child)) continue;
    if (child.props.id === 'registration-target-weight') return child;
    const found = targetInput(child.props.children);
    if (found) return found;
  }
}

describe('registration target field feedback', () => {
  it.each([-1, 400, 75, NaN, Infinity])('labels and explains invalid loss target %s', targetWeight => {
    const markup = renderToStaticMarkup(React.createElement(RegistrationScreen, props({ ...data, targetWeight })));
    expect(markup).toContain('for="registration-target-weight"');
    const input = markup.match(/<input[^>]*id="registration-target-weight"[^>]*>/)?.[0];
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain('aria-describedby="registration-target-weight-help"');
    expect(input).toContain('min="25"');
    expect(input).toContain('max="350"');
    expect(markup).toMatch(/<p id="registration-target-weight-help" role="alert"/);
    expect(input).not.toMatch(/value="(?:NaN|Infinity)"/);
  });

  it('renders a valid target with non-error help', () => {
    const markup = renderToStaticMarkup(React.createElement(RegistrationScreen, props()));
    expect(markup).toMatch(/id="registration-target-weight"[^>]*aria-invalid="false"/);
    expect(markup).not.toMatch(/id="registration-target-weight-help" role="alert"/);
  });

  it('retains an invalid typed target for validation instead of clamping it', () => {
    let edited = data;
    const parameters = { ...props(), setRegData: (update: React.SetStateAction<RegistrationData>) => {
      edited = typeof update === 'function' ? update(edited) : update;
    } };
    const input = targetInput(RegistrationScreen(parameters));
    expect(input).toBeDefined();
    input!.props.onChange!({ target: { value: '-5' } });
    expect(edited.targetWeight).toBe(-5);
  });
});
