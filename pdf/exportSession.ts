export type PdfExportOptions = {
  isCurrentSession?: () => boolean | Promise<boolean>;
};

/** Fail closed when the account/session changed before the browser download starts. */
export async function isPdfExportSessionCurrent(options?: PdfExportOptions): Promise<boolean> {
  if (!options?.isCurrentSession) return true;

  try {
    return await options.isCurrentSession();
  } catch {
    return false;
  }
}
