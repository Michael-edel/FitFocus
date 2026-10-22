import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadBuild(branch: string, recentBuilds = [{
  sha: 'deadbeef'.repeat(5), shortSha: 'deadbeef', committedAt: '2026-10-21T00:00:00Z', subject: 'Fix preview identity',
}]) {
  vi.resetModules();
  vi.doMock('../build-info.generated', () => ({ BUILD_SOURCE: {
    branch, commitCount: 1646, sha: 'deadbeef'.repeat(5), shortSha: 'deadbeef',
    builtAt: '2026-10-21T00:00:00Z', recentBuilds, recentCommits: [],
  } }));
  return { versioning: await import('../versioning'), notes: await import('../releaseNotes') };
}

afterEach(() => {
  vi.doUnmock('../build-info.generated');
  vi.resetModules();
});

describe('build identity', () => {
  it('keeps numbered main builds and their exact SHA', async () => {
    const { versioning, notes } = await loadBuild('main');
    expect(versioning.BUILD_SEQUENCE_LABEL).toBe('Сборка main №1646');
    expect(versioning.BUILD_SHORT_LABEL).toBe('Сборка main №1646 • deadbeef');
    expect(versioning.BUILD_VERSION_LABEL).toBe('Текущая сборка main №1646 • deadbeef');
    expect(notes.releaseNotes.find(note => note.isCurrent)?.label).toBe('main');
  });

  it('identifies the integration preview without assigning it a main build number', async () => {
    const branch = 'fix/main-integration-20261019';
    const { versioning, notes } = await loadBuild(branch);
    expect(versioning.BUILD_SEQUENCE_LABEL).toBe(`Сборка ветки ${branch} • deadbeef`);
    expect(versioning.BUILD_SHORT_LABEL).toBe(`Сборка ветки ${branch} • deadbeef`);
    expect(versioning.BUILD_VERSION_LABEL).toBe(`Текущая сборка ветки ${branch} • deadbeef`);
    const current = notes.releaseNotes.find(note => note.isCurrent);
    expect(current?.label).toBe(`ветка ${branch}`);
    expect(current?.summary).toContain(`Preview ветки ${branch}`);
    expect(current?.summary).toContain('deadbeef');
    expect(current?.groups.find(group => group.title === 'Как читать номера')?.items.join(' ')).not.toContain('№1646');
  });

  it('does not substitute historical main commits when preview history is empty', async () => {
    const { notes } = await loadBuild('fix/main-integration-20261019', []);
    const current = notes.releaseNotes.find(note => note.isCurrent);
    const history = current?.groups.find(group => group.title === 'Последние сборки ветки fix/main-integration-20261019');
    expect(history).toBeDefined();
    expect(history?.items.join(' ')).not.toContain('881efac');
    expect(current?.summary).toContain('deadbeef');
  });
});
