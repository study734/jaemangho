// DB와 인증 모듈을 로드하지 않는 실행 상태 확인. DB 준비 상태는 /api/health에서 별도로 검사한다.
export function GET() {
  return Response.json({ ok: true, kind: 'liveness' }, { headers: { 'Cache-Control': 'no-store' } });
}
