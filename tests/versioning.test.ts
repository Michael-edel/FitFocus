import { describe, expect, it } from 'vitest';
import { BUILD_SOURCE } from '../build-info.generated';
import { releaseNotes } from '../releaseNotes';
import {
  BUILD_SEQUENCE_LABEL,
  BUILD_SHORT_LABEL,
  BUILD_VERSION_LABEL,
  formatBuildSequenceLabel,
  formatBuildShortLabel,
  formatCurrentBuildLabel,
  isMainBuildBranch,
} from '../versioning';

describe('build labels', () => {
  it('uses the numbered label for main builds', () => {
    const build = { branch: 'main', sequence: 1646, shortSha: 'deadbeef' };

    expect(formatBuildSequenceLabel(build)).toBe('Сборка main №1646');
    expect(formatBuildShortLabel(build)).toBe('Сборка main №1646 • deadbeef');
    expect(formatCurrentBuildLabel(build)).toBe('Текущая сборка main №1646 • deadbeef');
  });

  it('identifies preview builds by branch and SHA without using a main sequence', () => {
    const build = { branch: 'fix/durable-outbox', sequence: null, shortSha: 'ed7100b' };

    expect(formatBuildSequenceLabel(build)).toBe('Сборка ветки fix/durable-outbox • ed7100b');
    expect(formatBuildShortLabel(build)).toBe('Сборка ветки fix/durable-outbox • ed7100b');
    expect(formatCurrentBuildLabel(build)).toBe('Текущая сборка ветки fix/durable-outbox • ed7100b');
  });

  it('does not label the checked-out preview as a main build', () => {
    if (isMainBuildBranch(BUILD_SOURCE.branch)) return;

    const currentReleaseNote = releaseNotes.find((release) => release.isCurrent);
    expect(BUILD_SEQUENCE_LABEL).toContain(`ветки ${BUILD_SOURCE.branch}`);
    expect(BUILD_SHORT_LABEL).toContain(BUILD_SOURCE.shortSha);
    expect(BUILD_VERSION_LABEL).toContain(`ветки ${BUILD_SOURCE.branch}`);
    expect(currentReleaseNote?.summary).toContain(`Preview ветки ${BUILD_SOURCE.branch}`);
    expect(BUILD_SEQUENCE_LABEL).not.toContain('Сборка main');
    expect(BUILD_VERSION_LABEL).not.toContain('Текущая сборка main');
    expect(currentReleaseNote?.summary).not.toContain('сборка main обновляется');
  });
});
