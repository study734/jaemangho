import { STEAM_STORAGE_COUNTRY } from '@/server/activity/steam-policy';

export default function SteamPrivacyPage() {
  return <main style={styles.main}>
    <h1 className="heading-1">Steam 활동 데이터 안내</h1>
    <p>Steam 공통 게임은 데이터 이용 안내에 동의한 뒤 사용할 수 있습니다. 공개 보유·플레이 기록과 저장한 취향을 함께할 멤버의 협동 게임 추천에 사용합니다. 동의는 서버에 기록하며, Steam에서 본인 확인을 마친 계정만 장기 활동 기록 준비를 시작합니다. 동의 직후 기준 기록을 준비하고, 이후 하루 한 번 예약 수집과 Steam 기능 방문 시 마지막 성공부터 7일 이상 지난 기록을 갱신합니다. 예약 수집은 한 번에 일부 계정만 처리하고 무료 사용량 보호 때문에 늦어지거나 건너뛸 수 있습니다.</p>
    <h2 className="heading-4">수집과 이용</h2>
    <p>공개된 보유 게임의 Steam ID, 게임 ID, 누적 플레이 분과 조회 시각을 받아 이전 관측과의 증가분을 기록합니다. 개인 맞춤 추천과 함께할 멤버의 협동 게임 추천에 플레이 변화를 반영하기 위한 용도입니다. 최근 30일 안에 시작하고 끝난 관측 구간의 증가분만 약한 추천 근거로 사용하며, 실제 플레이 시각이나 정확한 최근 2주 기록으로 해석하지 않습니다. Steam 비밀번호는 받지 않으며 API 원본 응답 전문을 장기 보관하지 않습니다.</p>
    <h2 className="heading-4">보관과 통제</h2>
    <p>활동 기록은 직접 삭제할 때까지 보관합니다. Steam 공통 게임의 추천 데이터 설정에서 수집을 중단하면 이후 기록 갱신과 저장 기록의 추천 이용을 멈춥니다. 기록 삭제를 선택하면 수집 요청, OpenID 확인 정보, 장기 플레이 기록과 관련 단기 캐시를 삭제합니다. 기존 공용 게임 비교 목록의 계정과 주인 지정은 유지됩니다. 기능 동의를 철회하면 수집과 저장 취향·관측 기록의 추천 이용을 멈추고, 다시 동의하기 전에는 Steam 기능을 사용할 수 없습니다. 취향 원문은 다른 멤버에게 표시하지 않습니다. 취향 삭제와 활동 기록 삭제는 별개입니다.</p>
    <h2 className="heading-4">저장 국가</h2>
    <p>{STEAM_STORAGE_COUNTRY ?? '운영 데이터베이스의 저장 국가를 확인하는 중이며, 확인 전에는 수집 요청을 받지 않습니다.'}</p>
    <p>Steam의 공개 설정에 따라 게임 목록을 확인할 수 없을 수 있습니다. 조회 불가를 플레이 시간이 0이라는 뜻으로 해석하지 않습니다.</p>
    <a href="/steam" className="btn btn-secondary">Steam으로 돌아가기</a>
  </main>;
}

const styles = {
  main: { maxWidth: '760px', margin: '0 auto', padding: '32px var(--page-padding)', display: 'grid', gap: '20px', color: 'var(--ink)', lineHeight: 1.65 },
};
