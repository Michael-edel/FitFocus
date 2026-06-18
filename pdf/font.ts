import { jsPDF } from "jspdf";

const INTER_FONT_NAME = "Inter";
const INTER_FONT_FILES = {
  normal: new URL("./fonts/NotoSans-Regular.ttf", import.meta.url).toString(),
  bold: new URL("./fonts/NotoSans-Bold.ttf", import.meta.url).toString(),
} as const;

const registeredDocs = new WeakSet<jsPDF>();

const looksLikeHtml = (u8: Uint8Array) => {
  // quick detect: "<!DO", "<htm", "<HTM"
  const a = u8[0], b = u8[1], c = u8[2], d = u8[3];
  if (a === 0x3c && b === 0x21 && c === 0x44 && d === 0x4f) return true; // <!DO
  if (a === 0x3c && (b === 0x68 || b === 0x48) && (c === 0x74 || c === 0x54) && (d === 0x6d || d === 0x4d)) return true; // <htm / <HTM
  return false;
};

const looksLikeFont = (u8: Uint8Array) => {
  // TTF: 00 01 00 00, OTF: 4F 54 54 4F ("OTTO"), TTC: 74 74 63 66 ("ttcf")
  if (u8.length < 4) return false;
  const a = u8[0], b = u8[1], c = u8[2], d = u8[3];
  const isTTF = a === 0x00 && b === 0x01 && c === 0x00 && d === 0x00;
  const isOTF = a === 0x4f && b === 0x54 && c === 0x54 && d === 0x4f;
  const isTTC = a === 0x74 && b === 0x74 && c === 0x63 && d === 0x66;
  return isTTF || isOTF || isTTC;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const loadInterFontBytes = async (url: string): Promise<ArrayBuffer> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Не удалось загрузить шрифт (${res.status}). URL: ${url}`);
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const buf = await res.arrayBuffer();
  const u8 = new Uint8Array(buf);

  // SPA fallback / proxy errors often return HTML with 200 OK.
  if (looksLikeHtml(u8)) {
    const head = new TextDecoder().decode(u8.slice(0, 200));
    throw new Error(
      `Font file вернулся как HTML (SPA fallback/redirect). content-type=${ct || "(empty)"} url=${url}. head=${head}`
    );
  }

  // Accept common font mime OR octet-stream, but also verify by magic bytes.
  const ctLooksOk =
    ct.startsWith("font/") ||
    ct.includes("application/octet-stream") ||
    ct.includes("application/x-font-ttf") ||
    ct.includes("application/font-sfnt");

  if (!ctLooksOk && !looksLikeFont(u8)) {
    throw new Error(
      `Font file не похож на шрифт. content-type=${ct || "(empty)"} url=${url}. bytes=${Array.from(u8.slice(0, 4))}`
    );
  }

  if (!looksLikeFont(u8)) {
    // even if ct is "font/ttf", verify content – some CDNs send html with wrong ct
    throw new Error(
      `Font file загружен, но сигнатура файла не TTF/OTF/TTC. url=${url}. bytes=${Array.from(u8.slice(0, 4))}`
    );
  }

  return buf;
};

export const ensurePdfInterFont = async (doc: jsPDF) => {
  if (registeredDocs.has(doc)) return;

  for (const [style, fontPath] of Object.entries(INTER_FONT_FILES) as Array<[
    "normal" | "bold",
    string,
  ]>) {
    const fontBytes = await loadInterFontBytes(fontPath);
    const base64 = arrayBufferToBase64(fontBytes);
    const fileName = fontPath.split("/").pop()!;
    doc.addFileToVFS(fileName, base64);
    doc.addFont(fileName, INTER_FONT_NAME, style);
  }

  registeredDocs.add(doc);
};
