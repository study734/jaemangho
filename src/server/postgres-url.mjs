// pg 8 treats these legacy names as verify-full unless libpq compatibility is
// explicitly requested. Name the existing behavior so a pg upgrade cannot weaken
// verification. Do not change explicit libpq, local/no-SSL or custom modes.
/** @param {string | undefined} connectionString */
export function postgresUrl(connectionString) {
  if (!connectionString) return connectionString;
  let url;
  try { url = new URL(connectionString); } catch { return connectionString; }
  // Do not reinterpret ambiguous duplicate options (pg uses the last value).
  if (url.searchParams.getAll('sslmode').length !== 1 || url.searchParams.getAll('uselibpqcompat').length > 1) return connectionString;
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.searchParams.get('uselibpqcompat') === 'true') return connectionString;
  if (!['prefer', 'require', 'verify-ca'].includes(url.searchParams.get('sslmode') ?? '')) return connectionString;
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}
