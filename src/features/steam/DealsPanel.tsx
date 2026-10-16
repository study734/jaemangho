'use client';

import { useState, useSyncExternalStore } from 'react';
import { steamApi } from './api';
import { createDealsModel } from './dealsModel';
import { UiIcon, VisualImage } from './VisualImage';

const won = (value: number) => `₩${value.toLocaleString('ko-KR')}`;

// 선택한 멤버가 바뀌면 부모가 key로 새로 만들어 이전 조합의 결과가 남지 않는다.
export function SteamDeals({ ids, nameOf }: { ids: string[]; nameOf: (id: string) => string }) {
  const [model] = useState(() => createDealsModel(steamApi, ids));
  const { data, loading, error } = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getServerSnapshot);
  return (
    <section style={styles.panel} aria-labelledby="steam-deals-title">
      <h3 id="steam-deals-title" style={styles.title}>같이 사면 좋은 협동 게임</h3>
      <p style={styles.hint}>확인된 협동 게임 중 선택한 인원이 함께 할 수 있고 아직 안 가진 멤버가 있는 게임의 한국 스토어 가격이에요. 세일 중인 게임이 먼저 나와요.</p>
      <div><button className="btn btn-secondary" disabled={loading || ids.length < 2} onClick={() => void model.load()}>
        {loading ? '가격 확인 중...' : data ? '다시 확인' : `가격 확인 (${ids.length}명)`}
      </button></div>
      {ids.length < 2 && <p style={styles.hint}>2명 이상 선택해 주세요.</p>}
      {error && <p style={styles.warn} role="alert">{error}</p>}
      {data && (data.excluded.length > 0 ? (
        <p style={styles.warn} role="status">게임 목록을 확인할 수 없는 사람: {data.excluded.map(nameOf).join(', ')}. 누가 사야 하는지 알 수 없어 보류했어요. 게임 세부 정보를 공개하거나 선택을 바꿔 주세요.</p>
      ) : <>
        {data.pricesUnavailable && <p style={styles.warn} role="status">스토어 가격을 불러오지 못했어요. 보유 현황만 표시하니 가격은 Steam에서 확인해 주세요.</p>}
        {data.deals.length === 0 ? <p style={styles.hint} role="status">{data.alreadyOwned > 0 ? '확인된 협동 게임을 이미 모두 가지고 있어요.' : '선택한 인원에 맞는 확인된 협동 게임이 없어요.'}</p> : (
          <ol className="steam-recommendations" style={styles.list}>
            {data.deals.map(deal => {
              const { price } = deal;
              const sale = !!price && price.discountPercent > 0;
              return (
                <li key={deal.appId} className="steam-recommendation" style={styles.row}>
                  <VisualImage src={`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${deal.appId}/header.jpg`} fallback={deal.name} width={160} height={75} className="result-game-cover" />
                  <div className="result-game-info">
                    <strong>{deal.name}</strong>
                    {price ? <span style={sale ? styles.sale : styles.hint}>
                      {sale ? `-${price.discountPercent}% ${won(price.final)} (정가 ${won(price.initial)})` : won(price.final)}
                    </span> : <span style={styles.hint}>가격은 Steam에서 확인해 주세요</span>}
                    <span style={styles.hint}>아직 없는 멤버 {deal.missingIds.length}명: {deal.missingIds.map(nameOf).join(', ')}</span>
                    {price && <span style={styles.hint}>모두 구매하면 {won(price.final * deal.missingIds.length)}</span>}
                  </div>
                  <a href={`https://store.steampowered.com/app/${deal.appId}/`} target="_blank" rel="noopener noreferrer" className="btn btn-link" aria-label={`${deal.name} Steam에서 확인`}>Steam에서 확인 <UiIcon name="box-arrow-up-right" /></a>
                </li>
              );
            })}
          </ol>
        )}
        <p style={styles.hint}>사람이 추려 둔 협동 게임 목록 안에서만 찾아요. Friend’s Pass처럼 구매 없이 참여하는 조건은 스토어에서 확인해 주세요.</p>
      </>)}
    </section>
  );
}

const styles = {
  panel: { backgroundColor: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: '8px', padding: 'var(--panel-padding)', display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  title: { color: 'var(--ink)', fontSize: '20px' },
  hint: { color: 'var(--slate)', fontSize: '13px' },
  warn: { color: 'var(--accent-pink)', fontSize: '13px' },
  sale: { color: 'var(--primary)', fontSize: '13px', fontWeight: 600 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const },
  row: { display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--hairline)', color: 'var(--ink)', fontSize: '14px' },
};
