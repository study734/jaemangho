// 모든 응답에 붙이는 보안 헤더. next.config.ts의 headers()가 사용한다.
// - 다른 사이트가 이 사이트를 iframe에 넣지 못하게 막는다(클릭재킹). 이 사이트가 Discord 위젯을 iframe으로 넣는 것은 영향이 없다.
// - 전체 CSP는 Next.js 인라인 스크립트와 충돌하므로 frame-ancestors만 둔다.
// - HSTS는 Vercel이 기본으로 붙이므로 여기서 다루지 않는다.
export const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
] as const;
