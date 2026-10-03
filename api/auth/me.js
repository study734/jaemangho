import { requireUser } from '../_lib/guard.js';

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (user) res.status(200).json(user);
}
