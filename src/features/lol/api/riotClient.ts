import axios, { type AxiosError } from 'axios';

// ==========================================
// 1. Global Request Queue (Rate Limiter)
// ==========================================
// 라이엇 개발자 키: 초당 20회, 2분당 100회
// 보수적으로 150ms 간격(초당 약 6.6회)으로 강제 직렬화 큐잉
const RATE_LIMIT_INTERVAL_MS = 150;
let lastRequestTime = 0;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const enqueueRequest = async () => {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < RATE_LIMIT_INTERVAL_MS) {
    // 큐의 꼬리에 간격만큼 대기 시간을 더해서 배치
    lastRequestTime += RATE_LIMIT_INTERVAL_MS;
    await delay(lastRequestTime - now);
  } else {
    lastRequestTime = now;
  }
};

// ==========================================
// 2. Axios Instance Setup
// ==========================================
export const riotClient = axios.create({
  timeout: 10000,
});

riotClient.interceptors.request.use(async (config) => {
  await enqueueRequest();
  return config;
}, (error) => {
  return Promise.reject(error);
});

// ==========================================
// 3. Local Caching Strategy
// ==========================================
// PUUID와 같은 불변 데이터는 무기한 보관
// 전적 등 가변 데이터는 5분(300,000ms) 유지
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export const getCachedData = <T>(cacheKey: string, isImmutable: boolean = false): T | null => {
  try {
    const raw = localStorage.getItem(`riot_cache_${cacheKey}`);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    const now = Date.now();

    // 불변 데이터가 아니며, TTL이 지났다면 캐시 만료
    if (!isImmutable && now - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(`riot_cache_${cacheKey}`);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
};

export const setCachedData = <T>(cacheKey: string, data: T) => {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(`riot_cache_${cacheKey}`, JSON.stringify(entry));
  } catch {
    // QuotaExceededError 등 발생 시 조용히 실패 (스토리지 공간 부족 시)
    console.warn('Failed to save to localStorage cache');
  }
};

// ==========================================
// 4. API Wrapping Functions
// ==========================================
export function riotErrorMessage(error: unknown): string {
  const source = error instanceof Error && error.cause ? error.cause : error;
  const status = (source as AxiosError | null)?.response?.status;
  if (status === 401) return '인증을 확인하지 못했습니다 (HTTP 401). 다시 로그인하고, 계속되면 관리자에게 문의해 주세요.';
  if (status === 403) return 'Riot API 키가 만료되었거나 권한이 없습니다 (HTTP 403). 관리자에게 문의해 주세요.';
  if (status === 404) return '대상 계정 정보를 찾지 못했습니다 (HTTP 404). Riot ID를 확인해 주세요.';
  if (status === 429) return '요청 한도를 초과했습니다 (HTTP 429). 잠시 후 다시 시도해 주세요.';
  return status ? `Riot 서버 응답 오류 (HTTP ${status}). 잠시 후 다시 시도해 주세요.` : 'Riot 연결을 확인하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.';
}

const pendingRequests = new Map<string, Promise<unknown>>();

export const riotGet = <T>(url: string, cacheKey?: string, isImmutable: boolean = false): Promise<T | null> => {
  if (cacheKey) {
    const cached = getCachedData<T>(cacheKey, isImmutable);
    if (cached !== null) return Promise.resolve(cached);
  }
  const pending = pendingRequests.get(url);
  if (pending) return pending as Promise<T | null>;
  const request = (async () => {
    try {
      const res = await riotClient.get<T>(url);
      if (cacheKey) setCachedData(cacheKey, res.data);
      return res.data;
    } catch (e) {
      const status = (e as AxiosError).response?.status;
      // 대상 없음은 null, 인증·호출 제한·서버 오류는 호출자가 처리한다.
      if (status === 404) return null;
      throw new Error(riotErrorMessage(e), { cause: e });
    }
  })().finally(() => pendingRequests.delete(url));
  pendingRequests.set(url, request);
  return request;
};
