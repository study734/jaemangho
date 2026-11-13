import { listAwards, awardsForUser } from '../chat/awards';
import { listHighlights } from '../chat/highlights';
import { getHotMoments } from '../chat/moments';
import { getPerson } from '../people';
import { commandUser } from './access';
import { fit, label, privateMessage, SITE, type Message } from './protocol';
import { scoreLabel } from '../../lib/chat-format';
import { TITLES } from '../../lib/titles';

// 채팅 집계 기록(시상식·개념글·뜨거웠던 순간)과 멤버 프로필. DB만 읽고 외부 호출은 없다.
const KST = { timeZone: 'Asia/Seoul' } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { ...KST, month: 'long', day: 'numeric' });
const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { ...KST, month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export async function records(kind: '시상식' | '개념글' | '순간'): Promise<Message> {
  if (kind === '시상식') {
    const awards = await listAwards(1);
    if (!awards.length) return privateMessage('아직 계산된 주간 시상식이 없어요. 한 주(월~일)가 끝나면 다음 날 새벽에 정해져요.');
    const lines = awards.map(award => {
      const title = TITLES[award.title];
      return `**${title.label}** ${label(award.authorName)}${title.unit ? ` — ${title.unit} ${award.value.toLocaleString('ko-KR')}` : ''}\n   ${title.blurb}`;
    });
    return privateMessage(fit([`🏆 ${day(`${awards[0].week}T00:00:00+09:00`)}부터 한 주의 시상식`, ...lines, `지난 시상식: ${SITE}/community/awards`].join('\n\n')));
  }
  if (kind === '개념글') {
    const { items, total } = await listHighlights(1, 5);
    if (!items.length) return privateMessage('아직 개념글이 없어요. 반응이나 답글을 받은 메시지가 생기면 매일 모여요.');
    const lines = items.map(item => `${scoreLabel(item.topEmoji, item.reactions, item.replies)} · [${label(item.authorName)}님의 메시지](${item.url}) · ${day(item.at)}`);
    return privateMessage(fit([`📌 최근 개념글 (전체 ${total.toLocaleString('ko-KR')}개)`, ...lines, `보관함: ${SITE}/community`].join('\n')));
  }
  const moments = await getHotMoments(5);
  if (!moments.length) return privateMessage('최근 8일 동안 10분에 3명 이상이 10개 이상 말한 순간이 없었어요.');
  const lines = moments.map(moment => `🔥 [${when(moment.at)}](${moment.url}) — 10분 동안 ${moment.people}명이 ${moment.messages}개`);
  return privateMessage(fit(['최근 8일 중 뜨거웠던 순간 (메시지 수 순)', ...lines, '내용은 읽지 않고 메시지·사람 수만 셌어요.'].join('\n')));
}

// /멤버 [대상]: 사이트의 멤버 프로필 요약. 대상을 고르지 않으면 본인.
export async function memberProfile(discordId: string): Promise<Message> {
  const userId = await commandUser(discordId);
  const person = userId ? await getPerson(userId) : null;
  if (!userId || !person) return privateMessage('사이트에 디스코드로 가입한 멤버만 볼 수 있어요. 차단된 계정은 볼 수 없어요.');
  const titles = await awardsForUser(userId);
  const lines = [
    `👤 **${label(person.name)}** · 최근 접속 ${day(person.lastLogin)}`,
    `롤: ${person.lol.length ? person.lol.map(account => label(`${account.gameName}#${account.tagLine}`)).join(', ') : '연결된 계정 없음'}`,
    `Steam: ${person.steam.length ? person.steam.map(account => label(account.name)).join(', ') : '연결된 계정 없음'}`,
    `칭호: ${titles.length ? titles.map(title => `${TITLES[title.title].label} ${title.count}회`).join(', ') : '아직 없음'}`,
    `프로필: ${SITE}/people/${encodeURIComponent(person.id)}`,
  ];
  return privateMessage(fit(lines.join('\n')));
}
