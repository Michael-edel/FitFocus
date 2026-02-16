type AiFeature = "coach" | "weekly" | "plan" | "foodphoto" | "ai";

type AiProxyBody = {
  model?: string;
  feature?: AiFeature;
  contents: any;
  config?: any;
};

function toGeminiTextContents(prompt: string) {
  return [
    {
      role: "user",
      parts: [{ text: prompt }],
    },
  ];
}

export async function callAiProxy(body: AiProxyBody) {
  const payload: AiProxyBody = { ...body };

  // ✅ FIX: если contents пришёл строкой — превращаем в правильный формат
  if (typeof payload.contents === "string") {
    payload.contents = toGeminiTextContents(payload.contents);
  }

  // ✅ FIX: если кто-то передал {parts:[{text:"..."}]} — оборачиваем в массив
  if (payload.contents && !Array.isArray(payload.contents) && (payload.contents as any).parts) {
    payload.contents = [payload.contents];
  }

  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // важно: чтобы в консоли было видно реальную ошибку
    const msg = (data as any)?.error?.message || (data as any)?.message || `AI error ${res.status}`;
    throw new Error(msg);
  }

  return data;
}
