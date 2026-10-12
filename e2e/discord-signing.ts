import { createPrivateKey, createPublicKey, sign } from 'node:crypto';

// Public, deterministic fixture key for the isolated E2E server only. Never use it for a Discord app.
const key = createPrivateKey({ key: Buffer.from(`302e020100300506032b657004220420${'01'.repeat(32)}`, 'hex'), type: 'pkcs8', format: 'der' });
export const DISCORD_TEST_PUBLIC_KEY = createPublicKey(key).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
export function signedDiscordRequest(value: unknown) {
  const data = JSON.stringify(value);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return { data, headers: { 'Content-Type': 'application/json', 'x-signature-timestamp': timestamp,
    'x-signature-ed25519': sign(null, Buffer.from(timestamp + data), key).toString('hex') } };
}
