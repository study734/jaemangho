import { z } from 'zod';

// 환경변수 점검. 값이 없는 것뿐 아니라 "변수 이름이 값으로 들어간 경우"처럼 형식이 틀린 것도 잡는다.
// (예전에 DISCORD_CLIENT_ID의 값이 글자 그대로 "DISCORD_CLIENT_ID"였던 적이 있다.)
// 앱이 멈추지 않도록 던지지 않고 문제 목록만 돌려준다. 값 자체는 어디에도 출력하지 않는다.
const snowflake = z.string().regex(/^\d{17,20}$/, '숫자 ID(17~20자리)여야 합니다');

const schema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'postgres:// 로 시작하는 연결 문자열이어야 합니다').optional(),
  POSTGRES_URL: z.string().regex(/^postgres(ql)?:\/\//, 'postgres:// 로 시작하는 연결 문자열이어야 합니다').optional(),
  SESSION_SECRET: z.string().min(32, '32자 이상이어야 합니다'),
  DISCORD_CLIENT_ID: snowflake,
  DISCORD_CLIENT_SECRET: z.string().min(1, '비어 있습니다'),
  DISCORD_GUILD_ID: snowflake,
  RIOT_API_KEY: z.string().regex(/^RGAPI-/, 'RGAPI- 로 시작하는 Riot 키여야 합니다'),
  // 선택: 채팅 하이라이트(명예의 전당)용. 설정했다면 형식을 점검한다.
  DISCORD_BOT_TOKEN: z.string().min(30, '봇 토큰이 너무 짧습니다').or(z.literal('')).optional(),
  // 선택: 1이면 웃음 분석(ㅋ 개수)을 켠다. 개발자 포털의 메시지 내용 권한도 켜야 효과가 있다.
  CHAT_LAUGH: z.enum(['0', '1', '']).optional(),
  CRON_SECRET: z.string().min(16, '16자 이상이어야 합니다').or(z.literal('')).optional(),
  // 선택: Steam 기능을 쓸 때만 필요하다. 설정했다면 형식을 점검한다.
  STEAM_API_KEY: z.string().regex(/^[0-9A-Fa-f]{32}$/, '32자리 16진수 Steam 키여야 합니다').or(z.literal('')).optional(),
});

type Env = Record<string, string | undefined>;

export function envProblems(env: Env = process.env): string[] {
  const problems: string[] = [];

  // 값이 변수 이름 그대로인 경우 (이름만 적고 값을 안 넣은 실수)
  for (const key of Object.keys(schema.shape)) {
    if (env[key] === key) problems.push(`${key}: 값이 변수 이름 그대로입니다. 실제 값을 넣어 주세요`);
  }

  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (env[key] === key) continue; // 위에서 이미 보고함
      problems.push(`${key}: ${env[key] === undefined || env[key] === '' ? '설정되지 않았습니다' : issue.message}`);
    }
  }
  if (!env.DATABASE_URL && !env.POSTGRES_URL) problems.push('DATABASE_URL: 설정되지 않았습니다');

  return [...new Set(problems)];
}
