import { describe, expect, it } from 'vitest';
import {
  attachmentResponseUrl,
  buildAttachmentRoute,
  fileToAttachment,
  inlineAttachmentBytes,
  isSafeInlineAttachmentMime,
  normalizeAttachmentMime,
  parseAttachmentsJson,
  SupportAttachmentTooLargeError,
} from '../functions/api/_lib/support_attachments';

describe('support attachment helpers', () => {
  it('builds ticket and message attachment URLs', () => {
    expect(buildAttachmentRoute('ticket 1', 2)).toBe('/api/support/attachment?id=ticket%201&index=2');
    expect(attachmentResponseUrl('ticket 1', 0, 'message/1')).toBe(
      '/api/support/attachment?id=ticket%201&messageId=message%2F1&index=0',
    );
  });

  it('normalizes stored attachment records', () => {
    const records = parseAttachmentsJson(JSON.stringify([
      { name: 'photo.png', mime: 'image/png', size: 12, storage_key: 'support/t/00-photo.png' },
      { name: 'note.txt', mime: 'text/plain', size: 4, data_url: 'data:text/plain;base64,dGVzdA==' },
      { bad: true },
    ]));

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ name: 'photo.png', kind: 'photo', storage_key: 'support/t/00-photo.png' });
    expect(records[1]).toMatchObject({ name: 'note.txt', kind: 'file' });
    expect(records[2]).toMatchObject({ name: 'attachment', kind: 'file' });
  });

  it('keeps unsafe MIME types out of inline rendering', () => {
    expect(normalizeAttachmentMime(' TEXT/HTML; charset=utf-8 ')).toBe('application/octet-stream');
    expect(isSafeInlineAttachmentMime('text/html')).toBe(false);
    expect(isSafeInlineAttachmentMime('image/png')).toBe(true);
  });

  it('decodes inline attachment bytes', () => {
    const inline = inlineAttachmentBytes({
      name: 'note.txt',
      mime: 'text/plain',
      size: 4,
      kind: 'file',
      data_url: 'data:text/plain;base64,dGVzdA==',
    });

    expect(inline?.mime).toBe('text/plain');
    expect(new TextDecoder().decode(inline?.bytes)).toBe('test');
  });

  it('stores message attachments under a message-specific key', async () => {
    let storedKey = '';
    const bucket = {
      async put(key: string) {
        storedKey = key;
      },
      async get() {
        return null;
      },
    };

    const attachment = await fileToAttachment(
      new File(['hello'], 'voice note.txt', { type: 'text/plain' }),
      { bucket, ticketId: 'ticket-1', messageId: 'message-1', index: 0 },
    );

    expect(storedKey).toBe('support/ticket-1/messages/message-1/00-voice_note.txt');
    expect(attachment.storage_key).toBe(storedKey);
  });

  it('throws a typed oversized attachment error without exposing the file name', async () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'secret-diagnostic-name.bin', {
      type: 'application/octet-stream',
    });

    await expect(fileToAttachment(file)).rejects.toBeInstanceOf(SupportAttachmentTooLargeError);
    await expect(fileToAttachment(file)).rejects.not.toThrow('secret-diagnostic-name.bin');
  });
});
