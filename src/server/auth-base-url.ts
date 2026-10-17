// Vercel injects these exact deployment/branch hosts. Do not replace this with
// *.vercel.app: unrelated projects must remain outside the authentication origin.
export function authBaseURL(env: Record<string, string | undefined> = process.env) {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  const deploymentHosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL]
    .filter((host): host is string => !!host && /^[a-z0-9-]+\.vercel\.app$/i.test(host));
  return { allowedHosts: [...new Set([
    'jaemangho.vercel.app', 'jaemangho.shop', 'www.jaemangho.shop',
    'jaemangho-wotae-s-projects.vercel.app', 'jaemangho-git-main-wotae-s-projects.vercel.app',
    ...deploymentHosts,
    ...(env.NODE_ENV !== 'production' ? ['localhost:*', '127.0.0.1:*'] : []),
  ])] };
}
