import { db } from '../db';
import { STEAM_STORAGE_COUNTRY } from '../activity/steam-policy';
import { hasSteamConsent } from './consent';

// 디스코드 게임추천 준비 화면(/connect/steam, intent/0005)이 보여 줄 상태: 내 Steam 계정 연결과 이용 동의.
// 연결은 로그인 때 디스코드 프로필의 Steam 연결(discord-connections.ts)이나 Steam 본인 확인(steam-openid.ts)으로 생긴다.
export interface SteamSetupStatus { accounts: { steamId: string; name: string }[]; consented: boolean; storageCountry: string | null }

export async function steamSetupStatus(userId: string): Promise<SteamSetupStatus> {
  const sql = await db();
  const [accounts, consented] = await Promise.all([
    sql`select steam_id as "steamId", persona_name as name from steam_members where owner_id = ${userId} order by created_at, steam_id`,
    hasSteamConsent(userId),
  ]);
  return { accounts: accounts as unknown as SteamSetupStatus['accounts'], consented, storageCountry: STEAM_STORAGE_COUNTRY };
}
