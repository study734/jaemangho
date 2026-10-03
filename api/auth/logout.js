import { SESSION_COOKIE, redirect, setCookie } from '../_lib/auth.js';

export default function handler(req, res) {
  setCookie(res, SESSION_COOKIE, '', 0);
  redirect(res, '/');
}
