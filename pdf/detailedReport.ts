import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FoodItem, UserHabit, UserProfile } from '../types';
import { Gender, Goal } from '../types';
import { formatBloodGlucose, getBloodGlucoseGuidance } from '../profileMath';
import { ensurePdfInterFont } from './font';
import { PDF_COLORS, pdfCard, pdfFooter, pdfH1, pdfSectionTitle, pdfHeader, pdfPaintBackground } from './theme';
import { aggregateWeek, bmiCategory, calcBmi, calcGoalProgressPct, habitCompliance, resolveBloodGlucose, weekRangeISO } from './metrics';

type Targets = { calories: number; protein: number; fat: number; carbs: number };

function drawWeightTrend(doc: jsPDF, user: UserProfile, x0: number, y0: number, w: number, h: number) {
  const history = (user.weightHistory || []).slice(-14);
  if (history.length < 2) return y0;
  const weights = history.map(p => p.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const span = Math.max(0.5, maxW - minW);

  pdfCard(doc, x0, y0, w, h + 18);
  pdfSectionTitle(doc, 'Динамика веса', x0 + 4, y0 + 8);
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(`Последние ${history.length} замеров • min ${minW.toFixed(1)} — max ${maxW.toFixed(1)} кг`, x0 + 4, y0 + 13);
  doc.setTextColor(...PDF_COLORS.ink);

  const frameX = x0 + 4;
  const frameY = y0 + 18;
  const frameW = w - 8;
  const frameH = h - 6;

  doc.setDrawColor(...PDF_COLORS.line);
  doc.setLineWidth(0.2);
  doc.rect(frameX, frameY, frameW, frameH);

  doc.setDrawColor(...PDF_COLORS.brand);
  doc.setLineWidth(0.6);
  const pts = history.map((p, i) => {
    const x = frameX + (i * (frameW / (history.length - 1)));
    const y = frameY + frameH - ((p.weight - minW) / span) * frameH;
    return { x, y };
  });
  for (let i = 0; i < pts.length - 1; i++) {
    doc.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
  }
  return y0 + h + 22;
}

export async function downloadDetailedHealthReportPdf(opts: {
  user: UserProfile;
  targets: Targets;
  foodDiary: FoodItem[];
  habits: UserHabit[];
  includeMealLog: boolean;
}) {
  const { user, targets, foodDiary, habits, includeMealLog } = opts;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  await ensurePdfInterFont(doc);
  doc.setFont('Inter', 'normal');

  const { startISO, endISO, label } = weekRangeISO(new Date());
  const agg = aggregateWeek(foodDiary, startISO, endISO);
  const progressPct = Math.round(calcGoalProgressPct(user));
  const compl = habitCompliance(habits);
  const bloodGlucose = resolveBloodGlucose(user);
  const generatedAt = new Date().toLocaleString();

  pdfH1(doc, 'FitFocus — Отчёт о результатах и эффективности стратегии', label);
  
  // Slogan (investor positioning)
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text('AI-платформа поведенческой трансформации здоровья', 14, 36);
  doc.setTextColor(...PDF_COLORS.ink);

  // ================= KPI DASHBOARD =================

  const change30d = (user.weightHistory?.length ?? 0) >= 2
    ? user.weightHistory![user.weightHistory!.length - 1].weight -
      user.weightHistory![0].weight
    : 0;

  const avgCal = Math.round(agg.avgLogged.cal);
  const calDiff = Math.round(avgCal - targets.calories);

  const kpiY = 44;
  const cardW = 85;
  const cardH = 28;

  function kpiCard(x: number, y: number, title: string, value: string, subtitle: string, color?: number[]) {
    pdfCard(doc, x, y, cardW, cardH);
    doc.setFont('Inter', 'bold');
    doc.setFontSize(16);
    if (color) doc.setTextColor(...color as [number, number, number]);
    doc.text(value, x + 6, y + 14);
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.muted as [number, number, number]);
    doc.text(title, x + 6, y + 6);
    doc.text(subtitle, x + 6, y + 22);
    doc.setTextColor(...PDF_COLORS.ink as [number, number, number]);
  }

  const progressColor = progressPct > 60
    ? [16, 185, 129] // emerald
    : progressPct > 30
    ? PDF_COLORS.brand
    : [245, 158, 11]; // amber

  kpiCard(14, kpiY,
    'Прогресс к цели',
    progressPct + '%',
    'Движение к целевому весу',
    progressColor
  );

  kpiCard(111, kpiY,
    'Динамика веса',
    change30d.toFixed(1) + ' кг',
    'Изменение за период',
    change30d < 0 ? [16, 185, 129] : [239, 68, 68]
  );

  kpiCard(14, kpiY + 36,
    'Средняя калорийность',
    avgCal + ' ккал',
    'Отклонение: ' + (calDiff > 0 ? '+' : '') + calDiff + ' ккал'
  );

  // ================= EXPANDED HABIT BLOCK =================

  const habitBlockY = kpiY + 36;
  const habitBlockH = 48;
  pdfCard(doc, 111, habitBlockY, 85, habitBlockH);

  doc.setFont('Inter', 'bold');
  doc.setFontSize(12);
  doc.text('Поведенческая дисциплина', 117, habitBlockY + 8);

  doc.setFontSize(14);
  doc.setTextColor(...PDF_COLORS.brand as [number, number, number]);
  doc.text(compl.pct + '%', 117, habitBlockY + 18);
  doc.setTextColor(...PDF_COLORS.ink as [number, number, number]);

  doc.setFont('Inter', 'normal');
  doc.setFontSize(8);

  const todayKey = new Date().toISOString().slice(0, 10);

  let hy = habitBlockY + 26;

  habits.slice(0, 4).forEach(h => {
    // Note: UserHabit doesn't store full weekHistory in types.ts.
    // We infer consistency from streak for visualization or assume extended data is passed.
    const weekDone = (h as any).weekHistory?.filter((d: any) => d).length ?? (h.streak > 7 ? 7 : h.streak);
    const todayDone = h.lastCompletedDate === todayKey;

    let color: number[] = [239, 68, 68]; // red
    if (weekDone >= 5) color = [16, 185, 129];      // green
    else if (weekDone >= 3) color = [245, 158, 11]; // amber

    doc.setTextColor(...color as [number, number, number]);
    doc.text('•', 117, hy);
    doc.setTextColor(...PDF_COLORS.ink as [number, number, number]);

    doc.text(
      `${h.title}  ${todayDone ? 'Сегодня: ✓' : 'Сегодня: ✕'}  ${weekDone}/7`,
      121,
      hy
    );

    hy += 8;
  });

  doc.setTextColor(...PDF_COLORS.ink as [number, number, number]);

  // ================= PROGRESS BAR =================

  const barY = kpiY + 80 + 4; // Shifted due to expanded habits
  const barWidth = 182;

  doc.setFontSize(10);
  doc.text('Прогресс достижения цели', 14, barY - 4);

  doc.setDrawColor(...PDF_COLORS.line);
  doc.rect(14, barY, barWidth, 6);

  doc.setFillColor(...progressColor as [number, number, number]);
  doc.rect(14, barY, (barWidth * progressPct) / 100, 6, 'F');

  doc.setFontSize(9);
  doc.text(progressPct + '%', 14 + barWidth - 10, barY + 5);

  // ================= ABOUT PLATFORM =================
  const aboutY = barY + 12;
  pdfCard(doc, 14, aboutY, 182, 34);
  pdfSectionTitle(doc, 'О платформе FitFocus', 18, aboutY + 8);
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  const about = [
    'FitFocus объединяет AI-анализ питания по фото, персональную метаболическую модель,',
    'трекер привычек и поведенческую аналитику, формируя понятный план действий на каждый день.',
    'Система ориентирована на устойчивые изменения без давления и с измеримым результатом.',
  ].join(' ');
  doc.text(doc.splitTextToSize(about, 174), 18, aboutY + 16);
  doc.setTextColor(...PDF_COLORS.ink);

  // ================= AI BLOCK =================

  const aiY = aboutY + 40;
  pdfCard(doc, 14, aiY, 182, 40);
  pdfSectionTitle(doc, 'AI-анализ поведенческой модели', 18, aiY + 8);

  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);

  const aiLines = [
    'Стратегия: ' + (progressPct > 40 ? 'устойчивая' : 'требует корректировки'),
    'Риск отклонения: ' + (compl.pct > 70 ? 'низкий' : 'средний'),
    'Ключевой фактор: стабильность калорийности и белка',
    'При сохранении стратегии цель достижима в прогнозируемые сроки.'
  ];

  let aiTextY = aiY + 16;
  for (const line of aiLines) {
    doc.text('• ' + line, 18, aiTextY);
    aiTextY += 6;
  }

  doc.setTextColor(...PDF_COLORS.ink);

  // ================= PAGE 2: DATA & ANALYTICS =================
  doc.addPage();
  pdfH1(doc, 'FitFocus — Данные и аналитика', label);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text('Подробная доказательная база: питание, макросы, привычки', 14, 36);
  doc.setTextColor(...PDF_COLORS.ink);

  // Clinical Details Card
  const bmi = calcBmi(user.weight, user.height);
  const bmiCat = bmiCategory(bmi);
  const clinicalCardH = bloodGlucose ? 30 : 22;
  pdfCard(doc, 14, 38, 182, clinicalCardH);
  pdfSectionTitle(doc, 'Клинические параметры', 18, 46);
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(`ИМТ: ${bmi.toFixed(1)} (${bmiCat}) • Вес: ${user.weight} кг • Возраст: ${user.age}`, 18, 52);
  if (bloodGlucose) {
    doc.text(`Сахар: ${formatBloodGlucose(bloodGlucose.value)} • ${getBloodGlucoseGuidance(bloodGlucose.value)}${bloodGlucose.measuredAt ? ` • ${bloodGlucose.measuredAt}` : ''}`, 18, 58);
  }
  doc.setTextColor(...PDF_COLORS.ink);

  // Nutrition Table
  autoTable(doc, {
    startY: 68,
    theme: 'plain',
    styles: { font: 'Inter', fontSize: 9 },
    headStyles: { font: 'Inter', fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [100, 116, 139] },
    head: [['День', 'Ккал', 'Белки (г)', 'Жиры (г)', 'Углеводы (г)']],
    body: agg.days.map(d => {
      const day = agg.byDay.get(d)!;
      return [d, Math.round(day.cal), Math.round(day.p), Math.round(day.f), Math.round(day.c)];
    }),
  });

  const afterTableY = (doc as any).lastAutoTable.finalY + 10;
  drawWeightTrend(doc, user, 14, afterTableY, 182, 44);

  // Habits section
  const afterChartY = afterTableY + 68;
  pdfSectionTitle(doc, 'Статус привычек', 14, afterChartY);
  autoTable(doc, {
    startY: afterChartY + 4,
    theme: 'plain',
    styles: { font: 'Inter', fontSize: 9 },
    head: [['Привычка', 'Статус', 'Серия']],
    body: habits.map(h => [
      h.title,
      `${h.current}/${h.goal} ${h.unit}`,
      `${h.streak} дн.`
    ])
  });

  // Clinical conclusion
  const finalTableY = (doc as any).lastAutoTable.finalY + 10;
  if (finalTableY > 230) doc.addPage();
  const concY = finalTableY > 230 ? 40 : finalTableY;
  
  pdfCard(doc, 14, concY, 182, 40);
  pdfSectionTitle(doc, 'Заключение специалиста', 18, concY + 8);
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  
  const advice = [
    `Целевая калорийность: ${targets.calories} ккал.`,
    `Фактическая средняя: ${avgCal} ккал (${calDiff > 0 ? '+' : ''}${calDiff} ккал от цели).`,
    compl.pct > 75 ? 'Дисциплина высокая. Рекомендовано поддерживать текущий темп.' : 'Рекомендовано сфокусироваться на регулярности выполнения базовых привычек.'
  ];
  
  let advY = concY + 16;
  for (const a of advice) {
    doc.text('• ' + a, 18, advY);
    advY += 6;
  }
  doc.setTextColor(...PDF_COLORS.ink);

  // Meal log (optional)
  if (includeMealLog) {
    doc.addPage();
    pdfH1(doc, 'FitFocus — Лог питания', label);
    const startY = 40;
    const rows = foodDiary
      .filter(f => {
        const dk = new Date(f.timestamp).toISOString().slice(0, 10);
        return dk >= startISO && dk <= endISO;
      })
      .slice(-250)
      .map(f => ([
        new Date(f.timestamp).toISOString().slice(0, 10),
        f.name,
        Math.round(f.calories),
        Math.round(f.protein),
        Math.round(f.fat),
        Math.round(f.carbs),
      ]));
    autoTable(doc, {
      startY: startY,
      theme: 'plain',
      styles: { font: 'Inter', fontSize: 8 },
      headStyles: { font: 'Inter', fontStyle: 'bold', fillColor: [248, 250, 252] },
      head: [['Дата', 'Приём пищи', 'Ккал', 'Б', 'Ж', 'У']],
      body: rows.length ? rows : [['—', 'Нет данных', '', '', '', '']],
      didDrawPage: () => {
        pdfPaintBackground(doc);
        pdfHeader(doc, 'FitFocus — Лог питания', label);
      },
    });
  }

  pdfFooter(doc, generatedAt);
  doc.save(`FitFocus_${user.name}_Performance_Report.pdf`);
}
