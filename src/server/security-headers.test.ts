import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { securityHeaders } from './security-headers';

describe('security headers', () => {
  it('applies every header to every path', async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((rule) => rule.source === '/:path*');
    expect(all?.headers).toEqual([...securityHeaders]);
  });

  it('blocks framing by other sites', () => {
    const byKey = Object.fromEntries(securityHeaders.map((h) => [h.key, h.value]));
    expect(byKey['X-Frame-Options']).toBe('DENY');
    expect(byKey['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
  });
});
