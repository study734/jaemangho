import { AiError, messagesFor, requestModel } from './client';
import type { AnalysisInput, AiContext } from './context';
import { acquireRequest, chargeModelCall, pauseProvider, releaseRequest } from './store';
import { parseTool, readTool, toolDefinitions, toolLabels } from './tools';
import { reportFailure } from '../diagnostics';
import { withinDeadline } from './deadline';

export interface AgentAnswer { answer: string; model: string; truncated: boolean; toolsUsed?: string[];
  evidence?: { context: AiContext; capturedAt: string } }

// One decision, at most one read tool and one final answer. No autonomous loop,
// writes, scheduler, provider fallback or automatic retry.
export function createAgent(deps = {
  generate: requestModel, execute: readTool, acquire: acquireRequest, charge: chargeModelCall,
  release: releaseRequest, pause: pauseProvider,
}, budgetMs = 25_000) {
  return async (input: AnalysisInput, userId: string, preference = '', parentSignal?: AbortSignal): Promise<AgentAnswer> => {
    const timeout = AbortSignal.timeout(budgetMs);
    const signal = parentSignal ? AbortSignal.any([timeout, parentSignal]) : timeout;
    const startedAt = Date.now();
    let phase = 'acquire'; // last started step; reported when the budget runs out
    async function work(): Promise<AgentAnswer> {
      signal.throwIfAborted();
      const requestId = await deps.acquire(userId, signal);
      try { return await answer(requestId); }
      catch (error) {
        if (error instanceof AiError && error.code === 'upstream' && error.status === 429) {
          phase = 'pause';
          await deps.pause(signal);
        }
        throw error;
      } finally {
        phase = 'release';
        // A fresh, short cleanup budget also covers late admission. Slots expire
        // in the DB after 30s if release cannot complete.
        await deps.release(requestId, AbortSignal.timeout(1_000)).catch(error => reportFailure('ai.release', error));
      }
    }
    async function answer(requestId: string): Promise<AgentAnswer> {
      signal.throwIfAborted();
      const previousSelection = input.history.filter(message => message.role === 'user').at(-1)?.selection ?? { steam: [], lol: null };
      const changed = JSON.stringify(previousSelection) !== JSON.stringify(input.selection);
      const messages = messagesFor(input, preference, { steam: new Set(input.selection.steam).size, lol: !!input.selection.lol, changed });
      phase = 'charge';
      await deps.charge(requestId, signal);
      signal.throwIfAborted();
      phase = 'model';
      const first = await deps.generate(messages, { tools: toolDefinitions, signal, onStage: stage => { phase = stage; } });
      const call = first.message.tool_calls?.[0];
      if (!call) return { answer: first.message.content!, model: first.model, truncated: first.truncated };
      let parsed;
      try { parsed = parseTool(call.function.name, call.function.arguments); }
      catch { throw new AiError('invalid_response', 502, '재순이의 조회 요청을 확인하지 못했어요. 다시 질문해 주세요.'); }
      const { name, args } = parsed;
      let result;
      phase = 'tool';
      try { result = await deps.execute(name, input.selection, signal, userId, args); }
      catch (error) {
        signal.throwIfAborted();
        const errorId = reportFailure(`ai.tool.${name}`, error);
        result = { status: 'unavailable', message: '조회에 실패했다. 빈 기록이나 게임 없음으로 설명하면 안 된다.', errorId };
      }
      signal.throwIfAborted();
      messages.push({ role: 'assistant', ...first.message }, { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      phase = 'charge';
      await deps.charge(requestId, signal);
      signal.throwIfAborted();
      phase = 'model';
      // No tools are offered in the final call, so execution cannot recurse.
      messages.push({ role: 'system', content: '조회 단계가 끝났다. 방금 도구가 돌려준 결과만 한국어 일반 문장으로 설명한다. 추가 도구 호출·도구 이름 추측·XML/JSON 호출 문법 출력은 금지한다. 최근 2주 시간과 누적 시간을 구분한다.' });
      const final = await deps.generate(messages, { signal, onStage: stage => { phase = stage; } });
      if (final.message.tool_calls || !final.message.content) throw new AiError('invalid_response', 502, '조회 결과의 답변을 읽지 못했어요.');
      return { answer: final.message.content, model: final.model, truncated: final.truncated,
        toolsUsed: [toolLabels[name] + (result.status === 'unavailable' ? ' · 조회 실패' : result.status === 'selection_required' ? ' · 선택 필요' : '')],
        ...('context' in result && result.context ? { evidence: { context: result.context, capturedAt: new Date().toISOString() } } : {}),
      };
    }
    return withinDeadline(work(), signal, () => ({ phase, elapsedMs: Date.now() - startedAt }));
  };
}

export const runAgent = createAgent();
