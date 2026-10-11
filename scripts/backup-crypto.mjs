import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

const MAGIC = Buffer.from('JMHBAK01');
const HEADER = 52;
export const validateBackupKey = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('Backup encryption key invalid');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) throw new Error('Backup encryption key invalid');
  return key;
};
export async function encryptBackup({ file, output, key }) {
  const secret = validateBackupKey(key);
  const digest = (await readFile(`${file}.sha256`, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Backup checksum invalid');
  const iv = randomBytes(12);
  const header = Buffer.concat([MAGIC, iv, Buffer.from(digest, 'hex')]);
  const owned = await open(output, 'wx', 0o600);
  try {
    await owned.writeFile(header);
    const cipher = createCipheriv('aes-256-gcm', secret, iv); cipher.setAAD(header);
    await pipeline(createReadStream(file), cipher, createWriteStream(output, { flags: 'a', mode: 0o600 }));
    await owned.write(cipher.getAuthTag(), 0, 16, (await stat(output)).size);
    return { version: 1, keyId: createHash('sha256').update(secret).digest('hex').slice(0, 16) };
  } catch (error) { await unlink(output).catch(() => {}); throw error; }
  finally { await owned.close(); }
}
export async function decryptBackup({ file, output, key }) {
  const secret = validateBackupKey(key);
  const input = await open(file, 'r');
  let owned;
  let manifestOwned = false;
  try {
    const size = (await input.stat()).size;
    if (size <= HEADER + 16) throw new Error('Encrypted backup invalid');
    const header = Buffer.alloc(HEADER); await input.read(header, 0, HEADER, 0);
    if (!header.subarray(0, 8).equals(MAGIC)) throw new Error('Encrypted backup version invalid');
    const tag = Buffer.alloc(16); await input.read(tag, 0, 16, size - 16);
    owned = await open(output, 'wx', 0o600);
    await writeFile(`${output}.sha256`, header.subarray(20).toString('hex'), { flag: 'wx', mode: 0o600 }); manifestOwned = true;
    const decipher = createDecipheriv('aes-256-gcm', secret, header.subarray(8, 20)); decipher.setAAD(header); decipher.setAuthTag(tag);
    await pipeline(createReadStream(file, { start: HEADER, end: size - 17 }), decipher, createWriteStream(output, { flags: 'a', mode: 0o600 }));
    return { version: 1 };
  } catch (error) {
    if (owned) await unlink(output).catch(() => {});
    if (manifestOwned) await unlink(`${output}.sha256`).catch(() => {});
    throw error;
  } finally { await owned?.close(); await input.close(); }
}
