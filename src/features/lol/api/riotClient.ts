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
  } catch (e) {
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
  } catch (e) {
    // QuotaExceededError 등 발생 시 조용히 실패 (스토리지 공간 부족 시)
    console.warn('Failed to save to localStorage cache');
  }
};

// ==========================================
// 4. API Wrapping Functions
// ==========================================
export const riotGet = async <T>(url: string, cacheKey?: string, isImmutable: boolean = false): Promise<T | null> => {
  if (cacheKey) {
    const cached = getCachedData<T>(cacheKey, isImmutable);
    if (cached !== null) return cached;
  }

  try {
    const res = await riotClient.get<T>(url);
    if (cacheKey) {
      setCachedData(cacheKey, res.data);
    }
    return res.data;
  } catch (e) {
    const err = e as AxiosError;
    const status = err.response?.status;
    
    // 404 (Not Found)는 null을 반환하여 에러 배너를 띄우지 않고 부드럽게 처리
    if (status === 404) return null;
    
    // 이외 400번대(429, 403, 401) 에러는 상위로 던지되, 호출부에서 조용히 잡을 수 있도록 함
    if (status === 401) throw new Error('라이엇 API 키가 올바르지 않습니다 (HTTP 401).', { cause: e });
    if (status === 403) throw new Error('라이엇 API 키가 만료되었습니다 (HTTP 403).', { cause: e });
    if (status === 429) throw new Error('API 요청 제한을 초과했습니다 (HTTP 429).', { cause: e });
    throw new Error(`Riot API 요청 실패 (HTTP ${status ?? 'network'})`, { cause: e });
  }
};
