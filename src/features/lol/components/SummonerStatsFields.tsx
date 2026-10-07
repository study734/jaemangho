import { useId } from 'react';
import type { CSSProperties } from 'react';
import type { Member } from '../types';
import { getTierLabelKR } from '../mockData';

export type SummonerStats = Pick<Member, 'summonerLevel' | 'leaguePoints' | 'tier' | 'rank' | 'wins' | 'losses'>;
type Field = { name: keyof SummonerStats; label: string; options?: readonly string[] };
const tiers = ['CHALLENGER', 'GRANDMASTER', 'MASTER', 'DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON', 'UNRANKED'];
const ranks = ['I', 'II', 'III', 'IV'];
const editFields: Field[] = [
  { name: 'summonerLevel', label: '레벨' }, { name: 'leaguePoints', label: 'LP' },
  { name: 'tier', label: '티어', options: tiers }, { name: 'rank', label: '랭크', options: ranks },
  { name: 'wins', label: '승리' }, { name: 'losses', label: '패배' },
];
const registerFields: Field[] = [
  { name: 'summonerLevel', label: '소환사 레벨' },
  { name: 'tier', label: '초기 티어', options: tiers }, { name: 'rank', label: '세부 랭크', options: ranks },
  { name: 'leaguePoints', label: '리그 포인트 (LP)' }, { name: 'wins', label: '승리 횟수' }, { name: 'losses', label: '패배 횟수' },
];

// 검색 후 직접 등록과 기존 소환사 편집이 같은 입력·라벨·옵션을 사용한다.
export function SummonerStatsFields({ value, onChange, variant = 'edit' }: {
  value: SummonerStats;
  onChange: (value: SummonerStats) => void;
  variant?: 'register' | 'edit';
}) {
  const prefix = useId();
  const registering = variant === 'register';
  const fields = registering ? registerFields : editFields;
  const columns = registering ? 3 : 2;
  const groups = Array.from({ length: fields.length / columns }, (_, index) => fields.slice(index * columns, (index + 1) * columns));
  return <>
    {groups.map((group, index) => <div key={index} className={registering ? 'responsive-form-grid' : undefined} style={registering ? styles.registerRow : styles.editRow}>
      {group.map(field => {
        const id = `${prefix}-${field.name}`;
        return <div key={field.name} style={registering ? styles.registerField : styles.editField}>
          <label htmlFor={id} style={registering ? styles.registerLabel : styles.editLabel}>{field.label}</label>
          {field.options ? <select id={id} className="text-input" style={registering ? styles.select : styles.editInput}
            value={value[field.name]} onChange={event => onChange({ ...value, [field.name]: event.target.value })}>
            {field.options.map(option => <option key={option} value={option}>{field.name === 'tier' ? getTierLabelKR(option) : option}</option>)}
          </select> : <input id={id} type="number" className="text-input" style={registering ? undefined : styles.editInput}
            value={value[field.name]} onChange={event => onChange({ ...value, [field.name]: Number(event.target.value) })} />}
        </div>;
      })}
    </div>)}
  </>;
}

const styles = {
  registerRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' },
  editRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  registerField: { display: 'flex', flexDirection: 'column', gap: '6px' },
  editField: { display: 'flex', flexDirection: 'column', gap: '4px' },
  registerLabel: { fontSize: '12.5px', fontWeight: 600, color: 'var(--slate)' },
  editLabel: { fontSize: '11px', color: 'var(--steel)' },
  select: { cursor: 'pointer' },
  editInput: { height: '36px', padding: '6px 10px', fontSize: '13px' },
} satisfies Record<string, CSSProperties>;
