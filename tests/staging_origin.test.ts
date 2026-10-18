import { describe, expect, it } from 'vitest';
import { parseStagingOrigin } from '../e2e/staging/stagingOrigin';

describe('staging origin configuration', () => {
  it.each([undefined, ''])('requires an explicit origin: %j', (origin) => {
    expect(() => parseStagingOrigin(origin)).toThrow(/FITFOCUS_STAGING_ORIGIN is required/);
  });

  it.each([
    'not-an-origin',
    'http://staging.example.test',
    'https://user:password@staging.example.test',
    'https://staging.example.test/app',
    'https://staging.example.test?token=secret',
    'https://staging.example.test/#fragment',
  ])('rejects a non-origin or insecure value: %s', (origin) => {
    expect(() => parseStagingOrigin(origin)).toThrow();
  });

  it.each([
    'https://fitfocus.pages.dev',
    'https://FITFOCUS.PAGES.DEV',
    'https://fitfocus.pages.dev.',
    'https://fitfocus.pages.dev.:443/',
  ])('rejects the production Pages host: %s', (origin) => {
    expect(() => parseStagingOrigin(origin)).toThrow(/production Pages hostname/);
  });

  it('normalizes a dedicated HTTPS origin', () => {
    expect(parseStagingOrigin('https://staging.example.test/')).toBe('https://staging.example.test');
  });
});
