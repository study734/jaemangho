import { listAwards, awardsForUser } from '../chat/awards';
import { listHighlights } from '../chat/highlights';
import { getHotMoments } from '../chat/moments';
import { getPerson } from '../people';
import { commandUser } from './access';
import { reportFailure } from '../diagnostics';
import { fit, label, privateMessage, SITE, type Message } from './protocol';
import { scoreLabel } from '../../lib/chat-format';
import { TITLES } from '../../lib/titles';
import { awardLines, weekRange } from '../chat/award-post';

// 채팅 집계 기록(/기록)과 멤버 프로필(/멤버). DB만 읽고 외부 호출은 없다.
const KST = { timeZone: 'Asia/Seoul' } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { ...KST, month: 'long', day: 'numeric' });
const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { ...KST, month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// /기록: 지난주 시상식·최근 개념글·뜨거웠던 순간을 한 메시지로 보여준다(고르는 단계 없음).
// 세 조회는 병렬로 하고, 한 구역이 실패해도 나머지는 보여주며 실패한 구역만 알린다(빈 기록과 구분).
async function section(operation: string, load: () => Promise<string>) {
  try { return await load(); }
  catch (error) { reportFailure(operation, error); return '불러오지 못했어요. 잠시 후 다시 시도해 주세요.'; }
}

const awardsSection = async () => {
  const awards = await listAwards(1);
  if (!awards.length) return '아직 계산된 주간 시상식이 없어요. 한 주(월~일)가 끝나면 다음 날 새벽에 정해져요.';
  return [`**${weekRange(awards[0].week)}**`, ...awardLines(awards)].join('\n');
};

const highlightsSection = async () => {
  const { items, total } = await listHighlights(1, 5);
  if (!items.length) return '아직 개념글이 없어요. 반응이나 답글을 받은 메시지가 생기면 매일 모여요.';
  return [`전체 ${total.toLocaleString('ko-KR')}개 중 최근 ${items.length}개`,
    ...items.map(item => `${scoreLabel(item.topEmoji, item.reactions, item.replies)} · [${label(item.authorName)}님의 메시지](${item.url}) · ${day(item.at)}`)].join('\n');
};

const momentsSection = async () => {
  const moments = await getHotMoments(5);
  if (!moments.length) return '최근 8일 동안 10분에 3명 이상이 10개 이상 말한 순간이 없었어요.';
  return moments.map(moment => `🔥 [${when(moment.at)}](${moment.url}) — 10분 동안 ${moment.people}명이 ${moment.messages}개`).join('\n');
};

export async function records(): Promise<Message> {
  const [awards, highlights, moments] = await Promise.all([
    section('chat.discord.awards', awardsSection),
    section('chat.discord.highlights', highlightsSection),
    section('chat.discord.moments', momentsSection),
  ]);
  return privateMessage(fit([
    `### 🏆 주간 시상식\n${awards}`,
    `### 📌 개념글\n${highlights}`,
    `### 🔥 뜨거웠던 순간\n-# 최근 8일, 메시지 수 순\n${moments}`,
    `-# 내용은 읽지 않고 반응·답글·메시지 수만 셌어요 · [더 보기](<${SITE}/community>)`,
  ].join('\n\n')));
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
    `-# [사이트 프로필](<${SITE}/people/${encodeURIComponent(person.id)}>)`,
  ];
  return privateMessage(fit(lines.join('\n')));
}
