'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { riotErrorMessage } from '../api/riotClient';

// Riot API 키는 서버(RIOT_API_KEY)가 관리하므로 여기서는 서버의 Riot 연결 상태만 확인한다.
export const Settings: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleTestAPI = async () => {
    setTestStatus('testing');
    setErrorMessage('');

    try {
      await axios.get(`/api/riot?region=asia&path=${encodeURIComponent('/riot/account/v1/accounts/by-riot-id/오채/KR1')}`);
      setTestStatus('success');
    } catch (e) {
      setTestStatus('failed');
      setErrorMessage(riotErrorMessage(e));
    }
  };

  return (
    <div style={embedded ? { ...styles.container, padding: 0, overflowY: 'visible' } : styles.container}>
      <header style={styles.header}>
        <div>
          <h2 className="heading-1" style={styles.title}>시스템 설정</h2>
          <p className="subtitle">외부 API 연동 상태를 확인합니다.</p>
        </div>
      </header>

      <div style={styles.content}>
        <section className="card-base" style={styles.apiForm}>
          <h3 className="heading-3" style={{ marginBottom: '20px', color: 'var(--ink)' }}>Riot 연결 상태</h3>
          <p className="body-sm" style={{ marginBottom: '16px' }}>
            Riot API 키는 서버에서 관리되므로 크루원이 따로 입력할 필요가 없습니다.
            아래 버튼으로 서버의 Riot 연결을 확인할 수 있습니다.
          </p>

          <div style={styles.testSection}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTestAPI}
              disabled={testStatus === 'testing'}
            >
              {testStatus === 'testing' ? '연결 테스트 중...' : '연결 테스트'}
            </button>

            {testStatus === 'success' && (
              <span role="status" style={{ color: 'var(--primary)', fontSize: '13.5px', fontWeight: 600 }}>라이엇 API 연결 테스트 성공!</span>
            )}
            {testStatus === 'failed' && (
              <span role="alert" style={{ color: 'var(--accent-orange)', fontSize: '13.5px', fontWeight: 600 }}>{errorMessage}</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: 'var(--page-padding)',
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    overflowY: 'auto',
    minHeight: 0,
  },
  header: { borderBottom: '1px solid var(--hairline)', paddingBottom: '20px' },
  title: { color: 'var(--ink)', letterSpacing: '-1px' },
  content: { display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '800px' },
  apiForm: { backgroundColor: 'var(--canvas-dark)', border: '1px solid var(--hairline)', padding: '24px' },
  testSection: { display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px' },
};
