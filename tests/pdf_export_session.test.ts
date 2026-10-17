import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadShortHealthReportPdf } from '../pdf/shortReport';
import { Gender, Goal, type UserProfile } from '../types';

const pdfMocks = vi.hoisted(() => ({
  save: vi.fn(),
  ensureFont: vi.fn(),
}));

vi.mock('jspdf', () => ({
  default: class MockJsPdf {
    constructor() {
      return new Proxy({}, {
        get(_target, property) {
          if (property === 'save') return pdfMocks.save;
          if (property === 'getNumberOfPages') return () => 1;
          if (property === 'splitTextToSize') return (text: string) => [text];
          return () => undefined;
        },
      });
    }
  },
}));

vi.mock('jspdf-autotable', () => ({ default: vi.fn() }));
vi.mock('../pdf/font', () => ({ ensurePdfInterFont: pdfMocks.ensureFont }));

const user = {
  id: 'account-a',
  name: 'Account A',
  gender: Gender.MALE,
  goal: Goal.LOSS,
  age: 34,
  height: 180,
  weight: 82,
  targetWeight: 75,
  activityLevel: 'moderate',
} as unknown as UserProfile;

describe('PDF export session guard', () => {
  beforeEach(() => {
    pdfMocks.save.mockReset();
    pdfMocks.ensureFont.mockReset();
  });

  it('does not download a report when the account changes while its font is loading', async () => {
    let finishFontLoad!: () => void;
    pdfMocks.ensureFont.mockImplementation(() => new Promise<void>((resolve) => {
      finishFontLoad = resolve;
    }));
    let sessionIsCurrent = true;

    const pendingExport = downloadShortHealthReportPdf({
      user,
      targets: { calories: 2000, protein: 120, fat: 70, carbs: 220 },
      foodDiary: [],
      habits: [],
      isCurrentSession: () => sessionIsCurrent,
    });

    await vi.waitFor(() => expect(pdfMocks.ensureFont).toHaveBeenCalledOnce());
    sessionIsCurrent = false;
    finishFontLoad();

    await expect(pendingExport).resolves.toBe(false);
    expect(pdfMocks.save).not.toHaveBeenCalled();
  });

  it('downloads the report when the account remains current', async () => {
    pdfMocks.ensureFont.mockResolvedValue(undefined);

    await expect(downloadShortHealthReportPdf({
      user,
      targets: { calories: 2000, protein: 120, fat: 70, carbs: 220 },
      foodDiary: [],
      habits: [],
      isCurrentSession: () => true,
    })).resolves.toBe(true);

    expect(pdfMocks.save).toHaveBeenCalledOnce();
  });
});
