type ErrorLike = {
  name?: unknown;
  message?: unknown;
};

function errorRecord(error: unknown): ErrorLike {
  return error && typeof error === 'object' ? error as ErrorLike : {};
}

export function getErrorMessage(error: unknown): string {
  const message = errorRecord(error).message;
  if (typeof message === 'string') return message;
  return typeof error === 'string' ? error : '';
}

export function classifyWisShareFailure(error: unknown): string {
  const message = getErrorMessage(error).toLowerCase();
  const name = errorRecord(error).name;

  if (name === 'AbortError' || message.includes('abort')) return 'share_aborted';
  if (message.includes('canvas_to_blob_failed')) return 'canvas_to_blob_failed';
  if (message.includes('security') || message.includes('tainted')) return 'canvas_security_blocked';
  if (message.includes('quota') || message.includes('storage')) return 'storage_unavailable';
  return 'wis_share_failed';
}

export function isSoftWeeklyAiError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('already in progress') ||
    message.includes('cooldown') ||
    message.includes('api key') ||
    message.includes('missing')
  );
}
