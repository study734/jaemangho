import { expect, it } from 'vitest';
import { authBaseURL } from './auth-base-url';

it('allows exactly the current deployment and branch hosts while keeping production loopback and wildcards out', () => {
  const result = authBaseURL({ NODE_ENV: 'production', VERCEL_URL: 'jaemangho-build-wotae-s-projects.vercel.app',
    VERCEL_BRANCH_URL: 'jaemangho-git-fix-wotae-s-projects.vercel.app' });
  expect(result).toMatchObject({ allowedHosts: expect.arrayContaining([
    'jaemangho-build-wotae-s-projects.vercel.app', 'jaemangho-git-fix-wotae-s-projects.vercel.app',
  ]) });
  expect(JSON.stringify(result)).not.toMatch(/localhost|127\.0\.0\.1|\*|another-project/);
});

it('rejects malformed injected hosts and preserves explicit existing local configuration', () => {
  expect(authBaseURL({ BETTER_AUTH_URL: 'http://localhost:33474' })).toBe('http://localhost:33474');
  for (const host of ['*.vercel.app', 'https://example.vercel.app', 'example.vercel.app/evil', 'example.vercel.app.attacker.invalid']) {
    expect(JSON.stringify(authBaseURL({ NODE_ENV: 'production', VERCEL_URL: host }))).not.toContain(host);
  }
});
