import type { NextRequest } from 'next/server';
import {
  blockInputSchema, getStatus, listSummonersWithCreators, listUsers, purgeRiotCache, setBlocked,
} from '@/server/admin';
import { parseBody, serverError } from '@/server/http';
import { requireAdmin } from '@/server/viewer';

// 관리자 전용 API. 리소스별 파일을 따로 두지 않고 ?resource= 로 나눈다.
const unknown = () => Response.json({ error: 'Unknown resource' }, { status: 404 });
const resourceOf = (request: NextRequest) => request.nextUrl.searchParams.get('resource');

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  try {
    switch (resourceOf(request)) {
      case 'status': return Response.json(await getStatus());
      case 'users': return Response.json(await listUsers());
      case 'members': return Response.json(await listSummonersWithCreators());
      default: return unknown();
    }
  } catch (e) {
    return serverError(e);
  }
}

// 사용자 차단/해제
export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  if (resourceOf(request) !== 'users') return unknown();

  const body = await parseBody(request, blockInputSchema);
  if (!body.ok) return body.response;
  const { id, blocked } = body.data;
  if (id === admin.id) return Response.json({ error: '자기 자신은 차단할 수 없습니다.' }, { status: 400 });

  try {
    if (!(await setBlocked(id, blocked))) {
      return Response.json({ error: '대상을 찾을 수 없거나 관리자입니다.' }, { status: 404 });
    }
    return Response.json({ id, blocked });
  } catch (e) {
    return serverError(e);
  }
}

// Riot 캐시 전체 삭제. 다음 요청부터 Riot을 다시 호출한다.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  if (resourceOf(request) !== 'cache') return unknown();

  try {
    return Response.json({ deleted: await purgeRiotCache() });
  } catch (e) {
    return serverError(e);
  }
}

