import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportWeeklyReportPdf } from '../features/progress/exportWeeklyReportPdf';
import { downloadDetailedHealthReportPdf } from '../pdf/detailedReport';
import { downloadProgressArchivePdf } from '../pdf/progressArchive';
import { downloadProgressComparisonPdf } from '../pdf/progressComparison';
import { downloadShortHealthReportPdf } from '../pdf/shortReport';
import type { WeeklyStoredReport } from '../weeklyAutoEngine';
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

type PdfExport = (isCurrentSession: () => boolean) => Promise<boolean>;

const weeklyReport: WeeklyStoredReport = {
  weekKey: '2026-42',
  createdAt: '2026-10-19T12:00:00.000Z',
  data: {
    wis: 82,
    weightDelta7: -0.4,
    weightDelta30: -1.8,
    compliance: 90,
    adaptationIndex: 12,
    status: 'excellent',
  },
};

const pdfExports: Array<[string, PdfExport]> = [
  ['short health report', (isCurrentSession) => downloadShortHealthReportPdf({
    user,
    targets: { calories: 2000, protein: 120, fat: 70, carbs: 220 },
    foodDiary: [],
    habits: [],
    isCurrentSession,
  })],
  ['detailed health report', (isCurrentSession) => downloadDetailedHealthReportPdf({
    user,
    targets: { calories: 2000, protein: 120, fat: 70, carbs: 220 },
    foodDiary: [],
    habits: [],
    includeMealLog: false,
    isCurrentSession,
  })],
  ['weekly report', (isCurrentSession) => exportWeeklyReportPdf(weeklyReport, { isCurrentSession })],
  ['progress comparison', (isCurrentSession) => downloadProgressComparisonPdf({
    userName: user.name,
    fromKey: '2026-10-01',
    toKey: '2026-10-19',
    fromLabel: '01.10.2026',
    toLabel: '19.10.2026',
    fromPhoto: false,
    toPhoto: false,
    totalPhotos: 0,
    totalMeasurements: 0,
  }, { isCurrentSession })],
  ['progress archive', (isCurrentSession) => downloadProgressArchivePdf({
    userName: user.name,
    startLabel: '01.10.2026',
    endLabel: '19.10.2026',
    totalPhotos: 0,
    totalMeasurements: 0,
    wearableLabel: 'Не подключено',
    summary: 'Нет событий',
    timelineItems: [],
  }, { isCurrentSession })],
];

describe('PDF export session guard', () => {
  beforeEach(() => {
    pdfMocks.save.mockReset();
    pdfMocks.ensureFont.mockReset();
  });

  it.each(pdfExports)('does not download the %s when its session changes during font loading', async (_name, startExport) => {
    let finishFontLoad!: () => void;
    pdfMocks.ensureFont.mockImplementation(() => new Promise<void>((resolve) => {
      finishFontLoad = resolve;
    }));
    let sessionIsCurrent = true;

    const pendingExport = startExport(() => sessionIsCurrent);

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
