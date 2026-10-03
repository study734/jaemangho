import axios from 'axios';

// 앱이 실제로 쓰는 Riot 엔드포인트만 허용 (그 외는 프록시로 통과시키지 않는다)
const ID = '[\\w-]+';
const ALLOWED_PATHS = [
  /^\/riot\/account\/v1\/accounts\/by-riot-id\/[^/?#]+\/[^/?#]+$/,
  new RegExp(`^/lol/summoner/v4/summoners/by-puuid/${ID}$`),
  new RegExp(`^/lol/league/v4/entries/by-puuid/${ID}$`),
  new RegExp(`^/lol/champion-mastery/v4/champion-masteries/by-puuid/${ID}/top$`),
  new RegExp(`^/lol/match/v5/matches/by-puuid/${ID}/ids$`),
  /^\/lol\/match\/v5\/matches\/[A-Z0-9_]+$/,
  new RegExp(`^/lol/spectator/v5/active-games/by-puuid/${ID}$`),
];
const FORWARD_PARAMS = ['count', 'start'];

// 같은 오리진에서만 호출되므로 CORS 헤더는 의도적으로 설정하지 않는다.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { region, path } = req.query;

  if (typeof region !== 'string' || typeof path !== 'string') {
    return res.status(400).json({ error: 'Missing region or path parameter' });
  }
  if (path.includes('..') || !ALLOWED_PATHS.some((re) => re.test(path))) {
    return res.status(403).json({ error: 'Path not allowed' });
  }

  // 키는 서버 환경변수에서만 읽는다 (클라이언트가 보낸 키는 무시)
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing RIOT_API_KEY' });
  }

  const targetRegion = region === 'asia' ? 'asia' : 'kr';
  const params = Object.fromEntries(
    FORWARD_PARAMS.filter((k) => typeof req.query[k] === 'string').map((k) => [k, req.query[k]])
  );

  try {
    const response = await axios.get(`https://${targetRegion}.api.riotgames.com${encodeURI(path)}`, {
      params,
      headers: { 'X-Riot-Token': apiKey },
      timeout: 10000,
    });
    return res.status(response.status).json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: error.message };
    return res.status(status).json(data);
  }
}
