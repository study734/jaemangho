import { getSession } from './auth.js';
import { getUser } from './users.js';

// 유효한 세션이 있고 차단되지 않은 사용자면 { id, name, isAdmin }을 돌려준다. 아니면 응답을 보내고 null.
export async function requireUser(req, res) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const user = await getUser(session.id);
  if (user?.blocked) {
    res.status(403).json({ error: 'Blocked' });
    return null;
  }
  return { id: session.id, name: session.name, isAdmin: user?.is_admin === true };
}

export async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!user.isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return user;
}
