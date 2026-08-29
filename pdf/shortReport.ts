import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FoodItem, UserHabit, UserProfile } from '../types';
import { Gender, Goal } from '../types';
import { formatBloodGlucose, getBloodGlucoseGuidance } from '../profileMath';
import { ensurePdfInterFont } from './font';
import { PDF_COLORS, pdfCard, pdfFooter, pdfH1, pdfSectionTitle } from './theme';
import { aggregateWeek, bmiCategory, calcBmi, calcGoalProgressPct, habitCompliance, resolveBloodGlucose, weekRangeISO } from './metrics';

type Targets = { calories: number; protein: number; fat: number; carbs: number };

export async function downloadShortHealthReportPdf(opts: {
  user: UserProfile;
  targets: Targets;
  foodDiary: FoodItem[];
  habits: UserHabit[];
}) {
  const { user, targets, foodDiary, habits } = opts;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  await ensurePdfInterFont(doc);
  doc.setFont('Inter', 'normal');

  const { startISO, endISO, label } = weekRangeISO(new Date());
  const agg = aggregateWeek(foodDiary, startISO, endISO);
  const bmi = calcBmi(user.weight, user.height);
  const bmiCat = bmiCategory(bmi);
  const progress = Math.round(calcGoalProgressPct(user));
  const compl = habitCompliance(habits);
  const bloodGlucose = resolveBloodGlucose(user);

  const generatedAt = new Date().toLocaleString();

  pdfH1(doc, 'FitFocus — Краткий отчёт', label);
  
  // Slogan (product positioning)
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text('Персональная AI-система управления метаболизмом', 14, 36);
  doc.setTextColor(...PDF_COLORS.ink);

  // Summary card
  pdfCard(doc, 14, 42, 182, 30);
  pdfSectionTitle(doc, 'Сводка', 18, 50);
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  const genderLabel = user.gender === Gender.MALE ? 'Мужской' : 'Женский';
  const goalLabel = user.goal === Goal.LOSS ? 'Похудение' : user.goal === Goal.GAIN ? 'Набор массы' : 'Поддержание';
  doc.text(`${user.name} • ${genderLabel}, ${user.age} • ${user.height} см`, 18, 57);
  doc.text(`Цель: ${goalLabel} • Активность: ${String(user.activityLevel)}`, 18, 63);
  doc.setTextColor(...PDF_COLORS.ink);

  // What the system did this week
  pdfCard(doc, 14, 76, 182, 28);
  pdfSectionTitle(doc, 'Что сделано системой за период', 18, 84);
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  const doneLines = [
    '• Выполнен анализ питания и рассчитаны итоговые КБЖУ по данным логирования',
    '• Пересчитаны персональные цели (калории и макрораспределение) по модели метаболизма',
    '• Оценена поведенческая дисциплина (привычки/стрики) и сформированы рекомендации',
  ];
  let dy = 90;
  for (const l of doneLines) {
    const lines = doc.splitTextToSize(l, 174);
    doc.text(lines, 18, dy);
    dy += lines.length * 4.6;
  }
  doc.setTextColor(...PDF_COLORS.ink);

  autoTable(doc, {
    startY: 112,
    theme: 'plain',
    tableLineColor: PDF_COLORS.line,
    tableLineWidth: 0.2,
    styles: { font: 'Inter', fontStyle: 'normal', fontSize: 10, cellPadding: 2, textColor: PDF_COLORS.ink },
    headStyles: { font: 'Inter', fontStyle: 'bold', fillColor: [248, 250, 252], textColor: PDF_COLORS.muted },
    head: [['Показатель', 'Значение']],
    body: [
      ['Текущий вес', `${user.weight} кг`],
      ['Целевой вес', `${user.targetWeight} кг`],
      ['ИМТ', `${bmi.toFixed(1)} • ${bmiCat}`],
      ['Прогресс к цели', `${progress}%`],
      ...(bloodGlucose ? [['Сахар крови', `${formatBloodGlucose(bloodGlucose.value)} • ${getBloodGlucoseGuidance(bloodGlucose.value)}${bloodGlucose.measuredAt ? ` • ${bloodGlucose.measuredAt}` : ''}`]] : []),
      ['Средняя калорийность (по дням с данными)', `${Math.round(agg.avgLogged.cal)} ккал/день (${agg.loggedDays}/7 дней)`],
      ['Средний белок (по дням с данными)', `${Math.round(agg.avgLogged.p)} г/день (${agg.loggedDays}/7 дней)`],
      ['Комплаенс привычек (сегодня)', `${compl.pct}% (${compl.done}/${compl.total})`],
    ],
  });

  // Small recommendation block
  pdfCard(doc, 14, 158, 182, 40);
  pdfSectionTitle(doc, 'Короткая рекомендация', 18, 166);
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  const calDiff = Math.round(agg.avgLogged.cal - targets.calories);
  const protDiff = Math.round(agg.avgLogged.p - targets.protein);
  const rec = [
    calDiff > 150 ? `Средние калории выше цели на ~${calDiff} ккал/день.` : calDiff < -150 ? `Средние калории ниже цели на ~${Math.abs(calDiff)} ккал/день.` : 'Калорийность близка к цели.',
    protDiff < -15 ? `Белок ниже цели примерно на ${Math.abs(protDiff)} г/день — добавьте 1–2 белковых порции.` : 'Белок в норме или близко к цели.',
    compl.pct < 50 ? 'Привычки выполняются нерегулярно — выберите 1 привычку и закрепите её 7 дней.' : 'Привычки в хорошем темпе — продолжайте.',
  ].join(' ');
  doc.text(rec, 18, 173, { maxWidth: 174 });
  doc.setTextColor(...PDF_COLORS.ink);

  pdfFooter(doc, generatedAt);
  doc.save(`FitFocus_${user.name}_Short_Report.pdf`);
}
