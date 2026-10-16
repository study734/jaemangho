import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const commandsUrl = new URL('../src/server/discord-interactions/commands.json', import.meta.url);

// POST upserts each command by name; bulk PUT would delete unrelated commands in the existing app.
export async function registerCommand({ args = [], env = process.env, fetchFn = fetch, log = console.log } = {}) {
  if (args.some(arg => !['--dry-run', '--apply', '--help'].includes(arg)) || args.includes('--apply') && args.includes('--dry-run')) {
    throw new Error('Use --dry-run or --apply, without additional arguments.');
  }
  if (args.includes('--help')) { log('npm run discord:register -- --dry-run | --apply'); return; }
  const commands = JSON.parse(await readFile(commandsUrl, 'utf8'));
  if (!args.includes('--apply')) { log(JSON.stringify(commands, null, 2)); return; }
  const app = env.DISCORD_CLIENT_ID;
  const guild = env.DISCORD_GUILD_ID;
  const token = env.DISCORD_BOT_TOKEN;
  if (!app || !/^\d{17,20}$/.test(app) || !guild || !/^\d{17,20}$/.test(guild) || !token) {
    throw new Error('Check DISCORD_CLIENT_ID, DISCORD_GUILD_ID and DISCORD_BOT_TOKEN.');
  }
  for (const command of commands) {
    let response;
    try {
      response = await fetchFn(`https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`, {
        method: 'POST', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(command), signal: AbortSignal.timeout(10_000),
      });
    } catch { throw new Error('Discord command registration failed: network or timeout. Safe to retry.'); }
    if (!response.ok) throw new Error(`Discord command registration failed: HTTP ${response.status}. Check app/server permissions; for 429, wait before retrying.`);
  }
  log(`Registered ${commands.map(c => c.name).join(', ')} in the configured server. Other commands were preserved.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  registerCommand({ args: process.argv.slice(2) }).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
}
