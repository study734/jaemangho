import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const commandsUrl = new URL('../src/server/discord-interactions/commands.json', import.meta.url);
const API = 'https://discord.com/api/v10';
const MODES = ['--dry-run', '--apply', '--deploy', '--help'];

// Discord가 돌려주는 명령에는 id·version·지역화 등 추가 필드가 붙는다. 정의에 적는 필드만 같은 모양으로 맞춰 비교한다.
const normalizeOption = (option) => ({
  type: option.type, name: option.name, description: option.description ?? '', required: !!option.required,
  choices: (option.choices ?? []).map(({ name, value }) => ({ name, value })),
  min_length: option.min_length ?? null, max_length: option.max_length ?? null,
  options: (option.options ?? []).map(normalizeOption),
});
export const normalizeCommand = (command) => ({
  name: command.name, type: command.type ?? 1, description: command.description ?? '',
  default_member_permissions: command.default_member_permissions ?? null,
  options: (command.options ?? []).map(normalizeOption),
});
// 서버에 없거나 내용이 다른 명령만 고른다. 정의에 없는 서버 명령은 건드리지 않는다.
export function changedCommands(defined, registered) {
  const current = new Map(registered.map(command => [command.name, JSON.stringify(normalizeCommand(command))]));
  return defined.filter(command => current.get(command.name) !== JSON.stringify(normalizeCommand(command)));
}

async function request(fetchFn, url, init) {
  try { return await fetchFn(url, { ...init, signal: AbortSignal.timeout(10_000) }); }
  catch { throw new Error('Discord command registration failed: network or timeout. Safe to retry.'); }
}
const failure = (status) => new Error(`Discord command registration failed: HTTP ${status}. Check app/server permissions; for 429, wait before retrying.`);

// 달라진 명령만 POST(이름 기준 upsert)한다. bulk PUT은 기존 앱의 다른 명령까지 지우므로 쓰지 않는다.
// 바뀐 것이 없으면 GET 한 번으로 끝나 배포마다 실행해도 Discord의 명령 생성 한도를 쓰지 않는다.
async function apply(commands, { env, fetchFn, log }) {
  const app = env.DISCORD_CLIENT_ID;
  const guild = env.DISCORD_GUILD_ID;
  const token = env.DISCORD_BOT_TOKEN;
  if (!app || !/^\d{17,20}$/.test(app) || !guild || !/^\d{17,20}$/.test(guild) || !token) {
    throw new Error('Check DISCORD_CLIENT_ID, DISCORD_GUILD_ID and DISCORD_BOT_TOKEN.');
  }
  const url = `${API}/applications/${app}/guilds/${guild}/commands`;
  const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
  const listed = await request(fetchFn, url, { method: 'GET', headers });
  if (!listed.ok) throw failure(listed.status);
  const registered = await listed.json().catch(() => null);
  if (!Array.isArray(registered)) throw new Error('Discord command registration failed: unexpected command list response.');
  const changed = changedCommands(commands, registered);
  for (const command of changed) {
    const response = await request(fetchFn, url, { method: 'POST', headers, body: JSON.stringify(command) });
    if (!response.ok) throw failure(response.status);
  }
  log(changed.length
    ? `Registered ${changed.map(c => c.name).join(', ')} in the configured server; ${commands.length - changed.length} unchanged. Other commands were preserved.`
    : `All ${commands.length} commands are already up to date in the configured server.`);
}

// --deploy: Vercel 운영 빌드(vercel.json buildCommand)에서 실행한다. 운영 배포에만 등록하고,
// 실패해도 배포를 막지 않는다(앱은 정상이고 명령만 이전 상태로 남는다). 원인은 상태 코드로만 남긴다.
export async function registerCommand({ args = [], env = process.env, fetchFn = fetch, log = console.log, warn = console.warn } = {}) {
  if (args.length > 1 || args.some(arg => !MODES.includes(arg))) throw new Error('Use --dry-run, --apply or --deploy, without additional arguments.');
  if (args.includes('--help')) { log('npm run discord:register -- --dry-run | --apply   (Vercel production build: --deploy)'); return; }
  const commands = JSON.parse(await readFile(commandsUrl, 'utf8'));
  if (args.includes('--deploy')) {
    if (env.VERCEL_ENV !== 'production') { log(`[discord] Skipping command registration outside production (VERCEL_ENV=${env.VERCEL_ENV ?? 'unset'}).`); return; }
    try { await apply(commands, { env, fetchFn, log: message => log(`[discord] ${message}`) }); }
    catch (error) { warn(`[discord] ${error.message} Deployment continues; commands keep their previous definitions.`); }
    return;
  }
  if (!args.includes('--apply')) { log(JSON.stringify(commands, null, 2)); return; }
  await apply(commands, { env, fetchFn, log });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  registerCommand({ args: process.argv.slice(2) }).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
}
