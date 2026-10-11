// 완료한 요청의 타이머·응답 스트림을 닫아 Durable Object의 불필요한 활성 시간을 줄인다.
export async function requestJson(fetchFn, url, timeout, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  try {
    response = await fetchFn(url, { redirect: 'manual', signal: controller.signal, headers });
    if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'configuration' : 'execution');
    return await response.json();
  } finally {
    clearTimeout(timer);
    await response?.body?.cancel().catch(() => {});
  }
}
