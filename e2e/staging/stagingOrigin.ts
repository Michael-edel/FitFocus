export function parseStagingOrigin(configuredOrigin: string | undefined): string {
  if (!configuredOrigin) {
    throw new Error(
      'FITFOCUS_STAGING_ORIGIN is required for staging checks; set it to the HTTPS origin of the isolated staging environment.',
    );
  }

  let stagingUrl: URL;

  try {
    stagingUrl = new URL(configuredOrigin);
  } catch {
    throw new Error('FITFOCUS_STAGING_ORIGIN must be an absolute HTTPS origin.');
  }

  if (
    stagingUrl.protocol !== 'https:' ||
    stagingUrl.username !== '' ||
    stagingUrl.password !== '' ||
    !['', '/'].includes(stagingUrl.pathname) ||
    stagingUrl.search !== '' ||
    stagingUrl.hash !== ''
  ) {
    throw new Error(
      'FITFOCUS_STAGING_ORIGIN must contain only an HTTPS origin, without credentials, path, query, or fragment.',
    );
  }

  const stagingHostname = stagingUrl.hostname.toLowerCase().replace(/\.$/, '');

  if (stagingHostname === 'fitfocus.pages.dev') {
    throw new Error(
      'FITFOCUS_STAGING_ORIGIN points to the production Pages hostname; use an isolated staging origin.',
    );
  }

  return stagingUrl.origin;
}
