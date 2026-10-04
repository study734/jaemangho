import { z } from 'zod';
import { riotConnection } from './lol/connection';
import { steamConnection } from './steam/connection';

const DISCORD = 'https://discord.com/api';

export interface RawConnection {
  id: string;
  name: string;
  type: string; // 디스코드 연결 종류 (예: steam)
}

// 디스코드 연결 한 종류(또는 몇 종류)를 우리 주제의 계정으로 묶는 처리기.
// 새 주제의 계정을 자동으로 가져오려면 src/server/<이름>/connection.ts 에 처리기를 만들고 아래 HANDLERS에 한 줄 더한다.
export interface ConnectionHandler {
  name: string;
  types: string[]; // 이 처리기가 이해하는 연결 종류
  // 형식 검증도 여기서 한다. 던져도 되고(호출하는 쪽이 로그로 남김), 다른 처리기를 막지 않는다.
  link(userId: string, connections: RawConnection[]): Promise<void>;
}

export const HANDLERS: ConnectionHandler[] = [steamConnection, riotConnection];

const connectionsSchema = z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), revoked: z.boolean().optional() }));

// 사용자가 디스코드에 연결해 둔 모든 앱(취소된 것 제외). 연결 목록 권한(connections)이 없거나 호출이 실패하면
// 빈 목록이다(로그인을 막지 않는다). 계정 이름과 id는 로그에 남기지 않고 종류만 남긴다.
export async function fetchConnections(accessToken: string, fetchFn: typeof fetch = fetch): Promise<RawConnection[]> {
  try {
    const res = await fetchFn(`${DISCORD}/users/@me/connections`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const parsed = connectionsSchema.safeParse(await res.json());
    if (!parsed.success) return [];
    return parsed.data.filter((c) => !c.revoked).map(({ id, name, type }) => ({ id, name, type }));
  } catch {
    return [];
  }
}

// 모든 연결을 훑어서, 아는 종류는 해당 처리기에 넘긴다. 한 처리기가 실패해도 나머지는 계속한다.
export async function linkConnections(userId: string, connections: RawConnection[], handlers: ConnectionHandler[] = HANDLERS) {
  const known = new Set(handlers.flatMap((h) => h.types));
  const types = (list: RawConnection[]) => [...new Set(list.map((c) => c.type))].sort().join(',') || '(none)';
  // 종류 이름만 남긴다. 어떤 연결이 오는지, 아직 처리기가 없는 종류가 무엇인지 알 수 있다.
  console.info(`discord connection types: ${types(connections)}; unhandled: ${types(connections.filter((c) => !known.has(c.type)))}`);

  const jobs = handlers.flatMap((h) => {
    const mine = connections.filter((c) => h.types.includes(c.type));
    return mine.length ? [h.link(userId, mine).catch((e) => console.error(`discord connection link failed (${h.name})`, e))] : [];
  });
  await Promise.all(jobs);
}
