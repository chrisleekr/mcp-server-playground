/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: [
    'main',
    {
      name: 'feat/*',
      prerelease: 'dev.${commit.short}',
      channel: 'dev',
    },
    {
      name: 'fix/*',
      prerelease: 'dev.${commit.short}',
      channel: 'dev',
    },
    {
      name: 'refactor/*',
      prerelease: 'dev.${commit.short}',
      channel: 'dev',
    },
    {
      name: 'perf/*',
      prerelease: 'dev.${commit.short}',
      channel: 'dev',
    },
    {
      name: 'revert/*',
      prerelease: 'dev.${commit.short}',
      channel: 'dev',
    },
  ],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        releaseRules: [
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'refactor', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'revert', release: 'patch' },
          { type: 'docs', release: false },
          { type: 'style', release: false },
          { type: 'chore', release: false },
          { type: 'test', release: false },
          { type: 'build', release: false },
          { type: 'ci', release: false },
          { type: 'bump', release: 'patch' },
        ],
      },
    ],
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/npm',
      {
        pkgRoot: '.',
        npmPublish: false,
      },
    ],
    [
      '@semantic-release/npm',
      {
        pkgRoot: 'dist',
        npmPublish: true,
        distTag: 'dev',
      },
    ],
    [
      '@semantic-release/exec',
      {
        successCmd: 'echo "${nextRelease.version}" > RELEASE_VERSION',
      },
    ],
  ],
};
