import { describe, expect, it } from 'vitest';
import { actionName } from './usage';
import { interactionSchema, type Interaction } from './protocol';

// intent/0003 R1·R4: 사람이 읽는 기능 이름. 사용자·입력값은 이름에 넣지 않는다.
const base = { id: '100000000000000009', application_id: '100000000000000001', token: 't', guild_id: '100000000000000002', member: { user: { id: '100000000000000003' } } };
const parse = (value: object) => interactionSchema.parse({ ...base, ...value }) as Interaction;
const party = '100000000000000050';

describe('actionName', () => {
  it('명령은 /이름, 하위 명령은 /이름 하위, 메시지 명령은 이름', () => {
    expect(actionName(parse({ type: 2, data: { name: '게임추천', type: 1, options: [{ name: '범위', type: 3, value: 'any' }] } }))).toBe('/게임추천');
    expect(actionName(parse({ type: 2, data: { name: '운영', type: 1, options: [{ name: '상태', type: 1 }] } }))).toBe('/운영 상태');
    expect(actionName(parse({ type: 2, data: { name: '운영', type: 1, options: [{ name: '캐시', type: 1, options: [{ name: '종류', type: 3, value: 'steam' }] }] } }))).toBe('/운영 캐시');
    expect(actionName(parse({ type: 2, data: { name: '출처 찾기', type: 3, target_id: party, resolved: { messages: {} } } }))).toBe('출처 찾기');
  });
  it('버튼·선택은 소속 명령 › 동작', () => {
    const button = (custom_id: string) => parse({ type: 3, data: { component_type: 2, custom_id } });
    expect(actionName(button(`party:${party}:more:5`))).toBe('게임추천 › 다른 추천');
    expect(actionName(button(`party:${party}:pick:3`))).toBe('게임추천 › 하나 뽑기');
    expect(actionName(button(`party:${party}:again:all:fresh`))).toBe('게임추천 › 지난번 멤버로');
    expect(actionName(button(`lobby:${party}:join`))).toBe('모집 › 참여');
    expect(actionName(button(`lobby:${party}:recommend`))).toBe('모집 › 게임추천');
    expect(actionName(parse({ type: 3, data: { component_type: 3, custom_id: `party:${party}:pref`, values: ['fresh'] } }))).toBe('게임추천 › 기준 바꾸기');
    expect(actionName(parse({ type: 3, data: { component_type: 5, custom_id: `steamrec:v1:${base.member.user.id}:all:${Math.floor(Date.now() / 1000)}`, values: [party, base.member.user.id] } }))).toBe('게임추천 › 친구 선택');
    expect(actionName(parse({ type: 3, data: { component_type: 3, custom_id: `lol:v1:${base.member.user.id}:${Math.floor(Date.now() / 1000)}`, values: ['abc'] } }))).toBe('전적 › 소환사 선택');
  });
  it('의견 제출은 명령·메시지를 구분하고, 입력 내용은 이름에 없다', () => {
    const submit = (custom_id: string) => parse({ type: 5, data: { custom_id, components: [{ type: 1, components: [{ type: 4, custom_id: 'body', value: '비밀' }] }] } });
    expect(actionName(submit('feedback:cmd'))).toBe('의견 제출');
    expect(actionName(submit(`feedback:msg:${party}:${party}`))).toBe('의견 제출 (메시지)');
  });
});
