import { checkHealth } from '@/server/health';

// 인증 없는 공개 엔드포인트. 응답에 아무 정보도 싣지 않고, 엣지 캐시가 반복 호출을 받아 DB 부하를 막는다.
export async function GET() {
  const ok = await checkHealth();
  return Response.json(
    { ok },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': ok ? 'public, s-maxage=30' : 'no-store' } }
  );
}
