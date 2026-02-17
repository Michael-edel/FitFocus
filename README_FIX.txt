Что исправлено
1) /api/ai теперь всегда возвращает поле `text` (извлекается из candidates[].content.parts[].text).
2) geminiService.ts нормализует ответ (если backend вернул сырой Gemini payload).

Куда положить файлы
- functions/api/ai.ts  -> в проект:  FitFocus/functions/api/ai.ts
- geminiService.ts     -> в проект:  FitFocus/geminiService.ts (или где он у вас лежит сейчас)
- App.tsx              -> без изменений (просто приложил для сверки)

После замены файлов:
- git add .
- git commit -m "fix: normalize gemini response (text)"
- git push
