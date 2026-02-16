# FitFocus Camera Module (PWA)

Этот архив содержит **новый модуль камеры** для съёмки фото прямо в PWA (Android Chrome + установленная PWA).

## Что внутри
- `services/camera.ts` — утилиты камеры: start/stop/capture
- `ui/components/CameraCapture.tsx` — модалка камеры (preview, flip, capture) + fallback `<input capture>`

## Как встроить (минимум)
1) Скопируй файлы в проект, сохранив пути:
- `src/services/camera.ts` (или `services/camera.ts` — как у тебя устроено)
- `src/ui/components/CameraCapture.tsx`

2) В месте, где сейчас кнопка “Загрузить фото”, добавь кнопку “Снять” и стейт модалки:

```tsx
import CameraCapture from "./ui/components/CameraCapture";

const [cameraOpen, setCameraOpen] = useState(false);

<button onClick={() => setCameraOpen(true)}>Снять</button>

<CameraCapture
  open={cameraOpen}
  onClose={() => setCameraOpen(false)}
  onCaptured={(file) => handlePhotoFile(file)} // используй существующий пайплайн
/>
```

`handlePhotoFile(file)` — это твой текущий обработчик: compression → (quality/confidence) → AI analyze → confirm/edit.

## Рекомендация по UX (после capture)
- показать “Подтвердить/поправить” (порция/ингредиенты) до сохранения
- если низкое качество: показать “Улучшить анализ” (повторный запрос AI)

## Ограничения
- Нужно HTTPS (у Cloudflare Pages есть)
- На некоторых WebView (Telegram/WhatsApp) камера может быть недоступна → используйте Chrome
