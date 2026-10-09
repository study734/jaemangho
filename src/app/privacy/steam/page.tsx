import { STEAM_STORAGE_COUNTRY } from '@/server/activity/steam-policy';

export default function SteamPrivacyPage() {
  return <main style={styles.main}>
    <h1 className="heading-1">Steam 활동 데이터 안내</h1>
    <p>재망호는 계정 주인이 Steam에서 본인 계정을 확인하고 별도로 요청한 경우에만 주간 활동 기록 수집을 시작합니다.</p>
    <h2 className="heading-4">수집과 이용</h2>
    <p>공개된 보유 게임의 Steam ID, 게임 ID, 누적 플레이 분과 조회 시각을 받아 이전 관측과의 증가분을 기록합니다. 친구들과의 게임 취향 변화를 나중에 돌아보기 위한 용도입니다. Steam 비밀번호는 받지 않으며 API 원본 응답 전문을 장기 보관하지 않습니다.</p>
    <h2 className="heading-4">보관과 통제</h2>
    <p>활동 기록은 직접 삭제할 때까지 보관합니다. Steam 설정에서 수집을 중단하면 이후 주기 조회를 멈춥니다. 기록 삭제를 선택하면 수집 요청, OpenID 확인 정보, 장기 플레이 기록과 관련 단기 캐시를 삭제합니다. 기존 공용 게임 비교 목록의 계정과 주인 지정은 유지됩니다.</p>
    <h2 className="heading-4">저장 국가</h2>
    <p>{STEAM_STORAGE_COUNTRY ?? '운영 데이터베이스의 저장 국가를 확인하는 중이며, 확인 전에는 주간 수집 요청을 받지 않습니다.'}</p>
    <p>Steam의 공개 설정에 따라 게임 목록을 확인할 수 없을 수 있습니다. 조회 불가를 플레이 시간이 0이라는 뜻으로 해석하지 않습니다.</p>
    <a href="/steam" className="btn btn-secondary">Steam으로 돌아가기</a>
  </main>;
}

const styles = {
  main: { maxWidth: '760px', margin: '0 auto', padding: '32px var(--page-padding)', display: 'grid', gap: '20px', color: 'var(--ink)', lineHeight: 1.65 },
};
