import React from 'react';
import { CheckCircle2, ImageUp, LifeBuoy, Loader2, Mic, Paperclip, Send, Square, Trash2, Video } from 'lucide-react';
import type { UserProfile } from './types';
import { BUILD_SHORT_LABEL } from './versioning';

type AttachmentDraft = {
  file: File;
  kind: 'photo' | 'video' | 'audio' | 'other';
  previewUrl?: string;
};

type SupportAttachment = {
  name: string;
  mime: string;
  size: number;
  kind: 'photo' | 'video' | 'voice' | 'file';
  data_url?: string;
};

type SupportMessage = {
  id: string;
  author_role: 'user' | 'admin';
  author_user_id: string;
  message: string;
  created_at: number;
  attachment_count: number;
  attachments?: SupportAttachment[];
};

type SupportTicket = {
  id: string;
  created_at: number;
  updated_at: number;
  category: string;
  section?: string | null;
  subject?: string | null;
  message: string;
  status: string;
  priority: string;
  attachment_count: number;
  app_version?: string | null;
  last_reply_at?: number | null;
  last_reply_by?: string | null;
  resolved_at?: number | null;
  closed_at?: number | null;
  attachments?: SupportAttachment[];
  messages?: SupportMessage[];
};

type Props = {
  currentUser?: UserProfile | null;
};

const CATEGORY_OPTIONS = [
  'Ошибка',
  'Неудобно',
  'Предложение',
  'Синхронизация',
  'Оплата',
  'Другое',
] as const;

const SECTION_OPTIONS = [
  'Обзор',
  'План',
  'Питание',
  'Рецепты',
  'Прогресс',
  'Настройки',
  'Авторизация',
  'Тарифы',
  'Админ',
  'Другое',
] as const;

function detectBrowserLabel() {
  if (typeof navigator === 'undefined') return 'Браузер';
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  return 'Браузер';
}

function detectDeviceLabel() {
  if (typeof navigator === 'undefined') return 'Устройство';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone / iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh/i.test(ua)) return 'Mac';
  return 'Устройство';
}

function buildSupportSystemContext() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return '';
  const nav = navigator as Navigator & { standalone?: boolean; userAgentData?: { platform?: string; mobile?: boolean; brands?: Array<{ brand: string; version: string }> } };
  const displayStandalone = window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
  const notificationPermission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  const lines = [
    `Устройство: ${detectDeviceLabel()}`,
    `Браузер: ${detectBrowserLabel()}`,
    `URL: ${window.location.href}`,
    `User-Agent: ${navigator.userAgent}`,
    `Platform: ${nav.userAgentData?.platform || navigator.platform || 'unknown'}`,
    `UA mobile: ${nav.userAgentData ? String(nav.userAgentData.mobile) : 'unknown'}`,
    `UA brands: ${nav.userAgentData?.brands?.map((item) => `${item.brand} ${item.version}`).join(', ') || 'unknown'}`,
    `Язык: ${navigator.language || 'unknown'}`,
    `Часовой пояс: ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'}`,
    `Viewport: ${window.innerWidth}x${window.innerHeight}`,
    `Screen: ${window.screen?.width || 0}x${window.screen?.height || 0}, DPR ${window.devicePixelRatio || 1}`,
    `Online: ${String(navigator.onLine)}`,
    `PWA standalone: ${String(displayStandalone)}`,
    `Service Worker: ${'serviceWorker' in navigator ? 'supported' : 'unsupported'}`,
    `Push API: ${'PushManager' in window ? 'supported' : 'unsupported'}`,
    `Notification permission: ${notificationPermission}`,
    `Build: ${BUILD_SHORT_LABEL}`,
  ];
  return lines.join('\n');
}

function fileKind(file: File): AttachmentDraft['kind'] {
  if (file.type.startsWith('image/')) return 'photo';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'other';
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function requiredFieldsMessage(fields: string[]) {
  if (fields.length === 0) return '';
  return `Заполните обязательные поля: ${fields.join(', ')}.`;
}

function objectPayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function supportSubmitErrorMessage(status: number, payload: unknown) {
  const body = objectPayload(payload);
  const code = String(body.code || body.error || '');
  if (status === 401 || code === 'UNAUTH') return 'Сессия истекла. Войдите снова и повторите отправку.';
  if (status === 413 || code === 'PAYLOAD_TOO_LARGE') return 'Слишком большой объём данных. Уменьшите размер вложений и попробуйте снова.';
  if (code === 'VALIDATION_ERROR' || code === 'REQUIRED_FIELDS') {
    const labels: Record<string, string> = {
      subject: 'тема',
      message: 'описание проблемы или вложение',
      device: 'устройство',
      browser: 'браузер',
    };
    const fields = Array.isArray(body.fields)
      ? body.fields.map((field: unknown) => labels[String(field)] || String(field)).filter(Boolean)
      : [];
    return fields.length ? requiredFieldsMessage(fields) : 'Заполните обязательные поля.';
  }
  if (code === 'TOO_MANY_ATTACHMENTS') return 'Можно отправить не больше 3 файлов.';
  if (code === 'ATTACHMENT_TOO_LARGE') return 'Один из файлов слишком большой. Прикрепите файл до 2 MB.';
  if (code === 'ATTACHMENT_PROCESSING_FAILED') return 'Не удалось обработать вложение. Попробуйте другой файл.';
  return 'Не удалось отправить обращение. Проверьте обязательные поля и попробуйте ещё раз.';
}

function supportReplyErrorMessage(status: number, payload: unknown) {
  const message = supportSubmitErrorMessage(status, payload);
  if (message.includes('обращение')) return message.replace('обращение', 'ответ');
  return message;
}

function formatTimestamp(value?: number | string | null) {
  if (!value) return '—';
  const date = new Date(typeof value === 'number' ? value : String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function compressImageAttachment(file: File): Promise<File> {
  const isImage = file.type.startsWith('image/');
  if (!isImage) return file;

  const src = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('IMAGE_LOAD_FAILED'));
    };
    img.src = url;
  });

  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(src.naturalWidth || src.width || 1, src.naturalHeight || src.height || 1));
  const width = Math.max(1, Math.round((src.naturalWidth || src.width || 1) * scale));
  const height = Math.max(1, Math.round((src.naturalHeight || src.height || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(src, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  if (!blob) return file;
  const newName = `${file.name.replace(/\.[^.]+$/, '') || 'image'}.jpg`;
  return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
}

export default function SupportScreen({ currentUser }: Props) {
  const [category, setCategory] = React.useState<(typeof CATEGORY_OPTIONS)[number]>('Ошибка');
  const [section, setSection] = React.useState<(typeof SECTION_OPTIONS)[number]>('Обзор');
  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [steps, setSteps] = React.useState('');
  const [device, setDevice] = React.useState(() => detectDeviceLabel());
  const [browser, setBrowser] = React.useState(() => detectBrowserLabel());
  const [contact, setContact] = React.useState(currentUser?.email || '');
  const [attachments, setAttachments] = React.useState<AttachmentDraft[]>([]);
  const [voiceRecording, setVoiceRecording] = React.useState(false);
  const [voiceSeconds, setVoiceSeconds] = React.useState(0);
  const [voiceAttachment, setVoiceAttachment] = React.useState<AttachmentDraft | null>(null);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [tickets, setTickets] = React.useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = React.useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = React.useState<SupportTicket | null>(null);
  const [loadingTickets, setLoadingTickets] = React.useState(false);
  const [replyMessage, setReplyMessage] = React.useState('');
  const [replyAttachments, setReplyAttachments] = React.useState<AttachmentDraft[]>([]);
  const [replySending, setReplySending] = React.useState(false);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (currentUser?.email) setContact(currentUser.email);
  }, [currentUser?.email]);

  const loadMyTickets = React.useCallback(async (preserveSelection = true) => {
    setLoadingTickets(true);
    try {
      const response = await fetch('/api/support/feedback/my', { credentials: 'include' });
      if (!response.ok) return;
      const json = await response.json().catch(() => null);
      const nextTickets = Array.isArray(json?.tickets) ? json.tickets : [];
      setTickets(nextTickets);
      const nextSelectedId = preserveSelection ? (selectedTicketId || nextTickets[0]?.id || null) : (nextTickets[0]?.id || null);
      setSelectedTicketId(nextSelectedId);
    } finally {
      setLoadingTickets(false);
    }
  }, [selectedTicketId]);

  const loadMyTicketDetail = React.useCallback(async (ticketId: string) => {
    if (!ticketId) return;
    const response = await fetch(`/api/support/feedback/my?id=${encodeURIComponent(ticketId)}`, { credentials: 'include' });
    if (!response.ok) return;
    const json = await response.json().catch(() => null);
    setSelectedTicket(json?.ticket || null);
  }, []);

  React.useEffect(() => {
    void loadMyTickets(false);
  }, [loadMyTickets]);

  React.useEffect(() => {
    if (!selectedTicketId) {
      setSelectedTicket(null);
      return;
    }
    void loadMyTicketDetail(selectedTicketId);
  }, [loadMyTicketDetail, selectedTicketId]);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const resetVoice = React.useCallback(() => {
    setVoiceAttachment(null);
    setVoiceSeconds(0);
    setVoiceRecording(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const startVoiceRecording = React.useCallback(async () => {
    setError(null);
    setSuccess(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Запись голоса не поддерживается в этом браузере.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `fitfocus-voice-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm', lastModified: Date.now() });
        const previewUrl = URL.createObjectURL(blob);
        setVoiceAttachment((prev) => {
          if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
          return { file, kind: 'audio', previewUrl };
        });
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setVoiceRecording(true);
      setVoiceSeconds(0);
      timerRef.current = window.setInterval(() => setVoiceSeconds((prev) => prev + 1), 1000);
    } catch (e: unknown) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Нужно разрешить доступ к микрофону.' : 'Не удалось начать запись голоса.');
      resetVoice();
    }
  }, [resetVoice]);

  const stopVoiceRecording = React.useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      resetVoice();
      return;
    }
    setVoiceRecording(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }, [resetVoice]);

  const addFiles = React.useCallback(async (files: FileList | File[]) => {
    setError(null);
    setSuccess(null);
    const picked = Array.from(files);
    if (picked.length === 0) return;
    if (attachments.length + picked.length + (voiceAttachment ? 1 : 0) > 3) {
      setError('Можно прикрепить не больше 3 файлов.');
      return;
    }

    const next: AttachmentDraft[] = [];
    for (const file of picked) {
      if (file.size > 2 * 1024 * 1024) {
        setError(`Файл "${file.name}" слишком большой. Для теста лучше до 2 MB.`);
        return;
      }
      const prepared = await compressImageAttachment(file);
      const kind = fileKind(prepared);
      next.push({
        file: prepared,
        kind,
        previewUrl: URL.createObjectURL(prepared),
      });
    }

    setAttachments((prev) => [...prev, ...next]);
  }, [attachments.length, voiceAttachment]);

  const removeAttachment = React.useCallback((index: number) => {
    setAttachments((prev) => {
      const item = prev[index];
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const addReplyFiles = React.useCallback(async (files: FileList | File[]) => {
    const picked = Array.from(files);
    if (picked.length === 0) return;
    if (replyAttachments.length + picked.length > 3) {
      setError('К ответу можно прикрепить не больше 3 файлов.');
      return;
    }
    const next: AttachmentDraft[] = [];
    for (const file of picked) {
      if (file.size > 2 * 1024 * 1024) {
        setError(`Файл "${file.name}" слишком большой. Для теста лучше до 2 MB.`);
        return;
      }
      const prepared = await compressImageAttachment(file);
      next.push({
        file: prepared,
        kind: fileKind(prepared),
        previewUrl: URL.createObjectURL(prepared),
      });
    }
    setReplyAttachments((prev) => [...prev, ...next]);
  }, [replyAttachments.length]);

  const removeReplyAttachment = React.useCallback((index: number) => {
    setReplyAttachments((prev) => {
      const item = prev[index];
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const onSubmit = React.useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedMessage = message.trim();
    const missingFields: string[] = [];
    if (!subject.trim()) missingFields.push('тема');
    if (!device.trim()) missingFields.push('устройство');
    if (!browser.trim()) missingFields.push('браузер');
    if (!trimmedMessage && !voiceAttachment && attachments.length === 0) missingFields.push('описание проблемы или вложение');
    if (missingFields.length > 0) {
      setError(requiredFieldsMessage(missingFields));
      return;
    }

    const fileList = [...attachments];
    if (voiceAttachment) fileList.push(voiceAttachment);
    if (fileList.length > 3) {
      setError('Можно отправить не больше 3 файлов.');
      return;
    }

    const totalBytes = fileList.reduce((sum, item) => sum + item.file.size, 0);
    if (totalBytes > 6 * 1024 * 1024) {
      setError('Общий размер вложений слишком большой. Попробуйте более короткое видео или голосовое сообщение.');
      return;
    }

    setSending(true);
    try {
      const form = new FormData();
      form.set('category', category);
      form.set('section', section);
      form.set('subject', subject.trim());
      form.set('message', trimmedMessage);
      form.set('steps', steps.trim());
      form.set('device', device.trim());
      form.set('browser', browser.trim());
      form.set('contact', contact.trim());
      form.set('app_version', BUILD_SHORT_LABEL);
      form.set('system_context', buildSupportSystemContext());
      fileList.forEach((item) => {
        form.append('attachments', item.file, item.file.name);
      });

      const response = await fetch('/api/support/feedback', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(supportSubmitErrorMessage(response.status, json));
      }

      setSuccess('Обращение отправлено. Оно появится в админке и будет доступно для проверки.');
      setCategory('Ошибка');
      setSection('Обзор');
      setSubject('');
      setMessage('');
      setSteps('');
      setDevice(detectDeviceLabel());
      setBrowser(detectBrowserLabel());
      setContact(currentUser?.email || '');
      attachments.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      setAttachments([]);
      if (voiceAttachment?.previewUrl) URL.revokeObjectURL(voiceAttachment.previewUrl);
      setVoiceAttachment(null);
      setVoiceSeconds(0);
      await loadMyTickets(false);
    } catch (e: unknown) {
      setError(errorMessage(e, 'Не удалось отправить обращение. Проверьте обязательные поля и попробуйте ещё раз.'));
    } finally {
      setSending(false);
    }
  }, [attachments, browser, category, contact, currentUser?.email, device, loadMyTickets, message, section, steps, subject, voiceAttachment]);

  const submitReply = React.useCallback(async () => {
    if (!selectedTicketId) return;
    if (!replyMessage.trim() && replyAttachments.length === 0) {
      setError('Добавьте текст ответа или файл.');
      return;
    }
    setReplySending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('ticket_id', selectedTicketId);
      form.set('message', replyMessage.trim());
      replyAttachments.forEach((item) => form.append('attachments', item.file, item.file.name));
      const response = await fetch('/api/support/feedback/my', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(supportReplyErrorMessage(response.status, json));
      }
      setSelectedTicket(json?.ticket || null);
      setReplyMessage('');
      replyAttachments.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      setReplyAttachments([]);
      await loadMyTickets();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Не удалось отправить ответ. Проверьте поля и попробуйте ещё раз.'));
    } finally {
      setReplySending(false);
    }
  }, [loadMyTickets, replyAttachments, replyMessage, selectedTicketId]);

  const audioPreview = voiceAttachment?.previewUrl || null;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-3 max-w-4xl">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100">
          <LifeBuoy className="h-3.5 w-3.5" />
          Поддержка
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-100">Сообщить об ошибке или оставить отзыв</h1>
        <p className="max-w-3xl text-slate-400 font-medium leading-7">
          Опишите проблему, прикрепите скриншот, фото, короткое видео или голосовое сообщение. Все обращения отправляются в Admin Console FitFocus, где их можно быстро проверить и разобрать.
        </p>
      </div>

      {error && (
        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100 font-semibold">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100 font-semibold flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5" />
          {success}
        </div>
      )}

      <form onSubmit={onSubmit} className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.9fr] gap-6 items-start">
        <div className="space-y-6">
          <div className="rounded-[2rem] bg-slate-900/60 border border-slate-800 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Тип обращения</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as typeof category)}
                  className="w-full rounded-2xl bg-slate-950/50 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option value={option} key={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Раздел</span>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value as typeof section)}
                  className="w-full rounded-2xl bg-slate-950/50 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  {SECTION_OPTIONS.map((option) => (
                    <option value={option} key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Тема *</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                aria-required="true"
                placeholder="Например: кнопка не нажимается после сохранения рецепта"
                className="w-full rounded-2xl bg-slate-950/50 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Устройство *</span>
                <input
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  aria-required="true"
                  placeholder="iPhone 17 Pro / Windows / Mac"
                  className="w-full rounded-2xl bg-slate-950/50 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </label>

              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Браузер *</span>
                <input
                  value={browser}
                  onChange={(e) => setBrowser(e.target.value)}
                  aria-required="true"
                  placeholder="Safari / Chrome / Edge"
                  className="w-full rounded-2xl bg-slate-950/50 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </label>
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Описание проблемы</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="Что произошло, что вы ожидали увидеть и что увидели на самом деле"
                className="w-full rounded-2xl bg-slate-950/50 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/40 resize-y"
              />
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Шаги воспроизведения</label>
              <textarea
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                rows={4}
                placeholder={'1. ...\n2. ...\n3. ...'}
                className="w-full rounded-2xl bg-slate-950/50 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/40 resize-y font-mono text-sm"
              />
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Контакт для ответа</label>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="email или оставьте как есть"
                className="w-full rounded-2xl bg-slate-950/50 border border-slate-800 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>
          </div>

          <div className="rounded-[2rem] bg-slate-900/60 border border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-black text-slate-100">Вложения</h2>
                <div className="text-slate-400 font-medium text-sm mt-1">Можно прикрепить скриншот, фото, короткое видео или голосовое сообщение.</div>
              </div>
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">До 3 файлов</div>
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="cursor-pointer inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-slate-200 font-black hover:bg-slate-900">
                <Paperclip className="h-4 w-4" />
                Прикрепить файл
                <input
                  type="file"
                  accept="image/*,video/*,audio/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) void addFiles(e.target.files);
                    e.currentTarget.value = '';
                  }}
                />
              </label>

              <button
                type="button"
                onClick={() => (voiceRecording ? stopVoiceRecording() : void startVoiceRecording())}
                className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 font-black transition-all ${voiceRecording ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20'}`}
              >
                {voiceRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {voiceRecording ? `Стоп · ${voiceSeconds}s` : 'Записать голос'}
              </button>
            </div>

            {voiceAttachment && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-slate-100 font-black">Голосовое сообщение</div>
                    <div className="text-slate-500 text-sm font-semibold">{voiceAttachment.file.name} · {formatBytes(voiceAttachment.file.size)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (voiceAttachment.previewUrl) URL.revokeObjectURL(voiceAttachment.previewUrl);
                      resetVoice();
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-slate-200 font-bold"
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить
                  </button>
                </div>
                {audioPreview && <audio className="mt-3 w-full" controls src={audioPreview} />}
              </div>
            )}

            {attachments.length > 0 && (
              <div className="space-y-3">
                {attachments.map((attachment, index) => (
                  <div key={`${attachment.file.name}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-black text-slate-100">
                          {attachment.kind === 'photo' && <ImageUp className="h-4 w-4 text-cyan-300" />}
                          {attachment.kind === 'video' && <Video className="h-4 w-4 text-violet-300" />}
                          {attachment.kind === 'audio' && <Mic className="h-4 w-4 text-emerald-300" />}
                          {attachment.kind === 'other' && <Paperclip className="h-4 w-4 text-slate-300" />}
                          <span className="truncate">{attachment.file.name}</span>
                        </div>
                        <div className="mt-1 text-slate-500 text-sm font-semibold">{formatBytes(attachment.file.size)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-slate-200 font-bold"
                      >
                        <Trash2 className="h-4 w-4" />
                        Удалить
                      </button>
                    </div>
                    {attachment.previewUrl && (
                      <img src={attachment.previewUrl} alt={attachment.file.name} className="mt-3 max-h-64 w-full rounded-2xl object-cover" />
                    )}
                    {attachment.kind === 'video' && attachment.previewUrl && (
                      <video className="mt-3 w-full rounded-2xl" controls src={attachment.previewUrl} />
                    )}
                    {attachment.kind === 'audio' && attachment.previewUrl && (
                      <audio className="mt-3 w-full" controls src={attachment.previewUrl} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] bg-slate-900/60 border border-slate-800 p-6 space-y-4 sticky top-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-indigo-100">
              <Send className="h-3.5 w-3.5" />
              Куда уходит
            </div>
            <div className="text-slate-100 font-black text-lg">В Admin Console FitFocus</div>
            <p className="text-slate-400 font-medium leading-7">
              Обращение попадает в защищённую панель поддержки FitFocus, где его можно открыть, посмотреть вложения и разобрать проблему вручную.
            </p>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Что лучше приложить</div>
              <ul className="space-y-2 text-slate-300 font-medium leading-6">
                <li>• Скриншот с ошибкой</li>
                <li>• Короткое видео до 2 MB</li>
                <li>• Голосовое сообщение с описанием проблемы</li>
                <li>• Устройство, браузер и шаги воспроизведения</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={sending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-5 py-4 text-white font-black hover:bg-indigo-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              {sending ? 'Отправляем…' : 'Отправить обращение'}
            </button>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-slate-400 text-sm font-medium leading-7">
              Если хотите, можно не писать длинный текст: просто запишите голос, добавьте скриншот и нажмите отправку.
            </div>
          </div>
        </div>
      </form>

      <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
        <div className="rounded-[2rem] bg-slate-900/60 border border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-100">Мои обращения</h2>
              <div className="text-slate-400 text-sm font-medium">Статус, история ответов и вложения.</div>
            </div>
            <button
              type="button"
              onClick={() => void loadMyTickets()}
              className="rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-2 text-slate-200 font-black hover:bg-slate-900"
            >
              Обновить
            </button>
          </div>

          <div className="space-y-3">
            {tickets.map((ticket) => {
              const active = selectedTicketId === ticket.id;
              return (
                <button
                  type="button"
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`w-full text-left rounded-2xl border p-4 transition ${active ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/50 hover:bg-slate-900/70'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-slate-100 font-black truncate">{ticket.subject || ticket.category}</div>
                      <div className="mt-1 text-slate-400 text-sm font-medium truncate">{ticket.section || 'Другое'} • {ticket.category}</div>
                    </div>
                    <div className="text-right">
                      <div className="inline-flex rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-black text-slate-200">
                        {ticket.status}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-500 font-semibold">
                    {formatTimestamp(ticket.last_reply_at || ticket.updated_at)} • вложений: {ticket.attachment_count}
                  </div>
                </button>
              );
            })}
            {!tickets.length && !loadingTickets && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-slate-500 font-medium">
                Пока нет обращений. После отправки они появятся здесь.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] bg-slate-900/60 border border-slate-800 p-6 space-y-4">
          <div>
            <h2 className="text-xl font-black text-slate-100">{selectedTicket?.subject || 'Выберите обращение'}</h2>
            <div className="mt-1 text-slate-400 text-sm font-medium">
              {selectedTicket ? `${selectedTicket.category} • ${selectedTicket.section || 'Другое'} • ${selectedTicket.status}` : 'Здесь будет переписка с поддержкой.'}
            </div>
          </div>

          {selectedTicket ? (
            <>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300">
                <div className="font-black text-slate-100">{selectedTicket.message}</div>
                <div className="mt-2 text-slate-500 font-semibold">Создано: {formatTimestamp(selectedTicket.created_at)}</div>
              </div>

              {!!selectedTicket.attachments?.length && (
                <div className="space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Вложения обращения</div>
                  {selectedTicket.attachments.map((attachment, index) => (
                    <div key={`${attachment.name}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                      <div className="font-black text-slate-100">{attachment.name}</div>
                      {attachment.kind === 'photo' && attachment.data_url && <img src={attachment.data_url} alt={attachment.name} className="mt-3 max-h-72 w-full rounded-2xl object-cover" />}
                      {attachment.kind === 'video' && attachment.data_url && <video className="mt-3 w-full rounded-2xl" controls src={attachment.data_url} />}
                      {attachment.kind === 'voice' && attachment.data_url && <audio className="mt-3 w-full" controls src={attachment.data_url} />}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">История</div>
                <div className="space-y-3 max-h-[26rem] overflow-auto pr-1">
                  {(selectedTicket.messages || []).map((item) => (
                    <div key={item.id} className={`rounded-2xl border p-4 ${item.author_role === 'admin' ? 'border-cyan-500/20 bg-cyan-500/5' : 'border-slate-800 bg-slate-950/50'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-black text-slate-100">{item.author_role === 'admin' ? 'Поддержка' : 'Вы'}</div>
                        <div className="text-xs text-slate-500 font-semibold">{formatTimestamp(item.created_at)}</div>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-slate-200 leading-7">{item.message || '—'}</div>
                      {!!item.attachments?.length && (
                        <div className="mt-3 space-y-2">
                          {item.attachments.map((attachment, index) => (
                            <div key={`${item.id}-${attachment.name}-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                              <div className="font-black text-slate-100">{attachment.name}</div>
                              {attachment.kind === 'photo' && attachment.data_url && <img src={attachment.data_url} alt={attachment.name} className="mt-2 max-h-64 w-full rounded-2xl object-cover" />}
                              {attachment.kind === 'video' && attachment.data_url && <video className="mt-2 w-full rounded-2xl" controls src={attachment.data_url} />}
                              {attachment.kind === 'voice' && attachment.data_url && <audio className="mt-2 w-full" controls src={attachment.data_url} />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {(!selectedTicket.messages || selectedTicket.messages.length === 0) && (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-slate-500 font-medium">
                      Ответов пока нет.
                    </div>
                  )}
                </div>
              </div>

              {selectedTicket.status !== 'closed' ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Ответ поддержке</div>
                  <textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    rows={4}
                    placeholder="Добавьте уточнение, новые шаги или скриншот"
                    className="w-full rounded-2xl bg-slate-900 border border-slate-800 px-4 py-3 text-slate-100 resize-y"
                  />
                  <div className="flex flex-wrap gap-3">
                    <label className="cursor-pointer inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-200 font-black hover:bg-slate-800">
                      <Paperclip className="h-4 w-4" />
                      Добавить файл
                      <input
                        type="file"
                        accept="image/*,video/*,audio/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) void addReplyFiles(e.target.files);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void submitReply()}
                      disabled={replySending}
                      className="inline-flex items-center gap-2 rounded-2xl bg-indigo-500 px-5 py-3 text-white font-black hover:bg-indigo-400 disabled:opacity-60"
                    >
                      {replySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {replySending ? 'Отправляем…' : 'Отправить ответ'}
                    </button>
                  </div>
                  {!!replyAttachments.length && (
                    <div className="space-y-3">
                      {replyAttachments.map((attachment, index) => (
                        <div key={`${attachment.file.name}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-black text-slate-100 truncate">{attachment.file.name}</div>
                            <button
                              type="button"
                              onClick={() => removeReplyAttachment(index)}
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-200 font-bold"
                            >
                              <Trash2 className="h-4 w-4" />
                              Удалить
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-100 font-medium">
                  Обращение закрыто. Для новой проблемы создайте новый тикет.
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6 text-slate-500 font-medium">
              Выберите обращение слева, чтобы увидеть историю и ответить поддержке.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
