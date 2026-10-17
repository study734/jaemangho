import { AiError } from './client';

// Observe late settlement too: a timed-out DB operation must not become an
// unhandled rejection, or keep the HTTP response waiting for cleanup.
export function withinDeadline<T>(work: Promise<T>, signal: AbortSignal, where: () => { phase: string; elapsedMs: number }): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new AiError('timeout', 504, '조회·답변 시간이 길어졌어요. 범위를 줄여 다시 요청해 주세요.'), where()));
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
