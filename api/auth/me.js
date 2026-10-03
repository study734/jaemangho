import { requireSession } from '../_lib/auth.js';

export default function handler(req, res) {
  const session = requireSession(req, res);
  if (session) res.status(200).json({ id: session.id, name: session.name });
}
