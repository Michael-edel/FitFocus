import { describe, expect, it } from 'vitest';
import { readFormDataRequest, readJsonRequest, readRequestText, RequestBodyTooLargeError } from '../functions/api/_lib/request_body';

describe('bounded request body reader', () => {
  it('rejects oversized content-length before reading the body', async () => {
    const request = new Request('https://fitfocus.test/api', {
      method: 'POST',
      headers: { 'content-length': '100' },
      body: 'small',
    });

    await expect(readRequestText(request, 10)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('rejects streamed bodies that exceed the limit without a useful content-length', async () => {
    const request = new Request('https://fitfocus.test/api', {
      method: 'POST',
      body: '0123456789abcdef',
    });

    await expect(readRequestText(request, 10)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('returns text for bodies within the limit', async () => {
    const request = new Request('https://fitfocus.test/api', {
      method: 'POST',
      body: 'hello',
    });

    await expect(readRequestText(request, 10)).resolves.toBe('hello');
  });

  it('parses JSON through the bounded body reader', async () => {
    const request = new Request('https://fitfocus.test/api', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
    });

    await expect(readJsonRequest(request, 32)).resolves.toEqual({ ok: true });
  });

  it('returns null for malformed JSON within the limit', async () => {
    const request = new Request('https://fitfocus.test/api', {
      method: 'POST',
      body: '{"ok"',
    });

    await expect(readJsonRequest(request, 32)).resolves.toBeNull();
  });

  it('rejects oversized JSON bodies before parsing', async () => {
    const request = new Request('https://fitfocus.test/api', {
      method: 'POST',
      body: JSON.stringify({ payload: 'x'.repeat(100) }),
    });

    await expect(readJsonRequest(request, 32)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('parses FormData through the bounded body reader', async () => {
    const form = new FormData();
    form.set('message', 'hello');
    form.append('attachments', new File(['file'], 'note.txt', { type: 'text/plain' }));
    const request = new Request('https://fitfocus.test/api', {
      method: 'POST',
      body: form,
    });

    const parsed = await readFormDataRequest(request, 2048);

    expect(parsed?.get('message')).toBe('hello');
    expect(parsed?.get('attachments')).toBeInstanceOf(File);
  });

  it('rejects oversized FormData bodies before parsing fields', async () => {
    const form = new FormData();
    form.set('payload', 'x'.repeat(2048));
    const request = new Request('https://fitfocus.test/api', {
      method: 'POST',
      body: form,
    });

    await expect(readFormDataRequest(request, 256)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});
