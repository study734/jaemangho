'use client';

import React, { useState } from 'react';
import axios, { type AxiosError } from 'axios';

// Riot API 키는 서버(RIOT_API_KEY)가 관리하므로 여기서는 서버의 Riot 연결 상태만 확인한다.
export const Settings: React.FC = () => {
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleTestAPI = async () => {
    setTestStatus('testing');
    setErrorMessage('');

    try {
      await axios.get(`/api/riot?region=asia&path=${encodeURIComponent('/riot/account/v1/accounts/by-riot-id/오채/KR1')}`);
      setTestStatus('success');
    } catch (e) {
      const status = (e as AxiosError).response?.status;
      const reason =
        status === 401 ? '로그인이 만료되었습니다. 다시 로그인해 주세요 (HTTP 401)' :
        status === 403 ? 'Riot API Key 만료 또는 권한 없음 (HTTP 403)' :
        status === 404 ? '계정 정보 없음 (HTTP 404)' :
        status === 429 ? '라이엇 서버 요청 제한 (HTTP 429)' :
        !status       ? '네트워크 연결 제한' :
        `서버 응답 오류 (HTTP ${status})`;

      setTestStatus('failed');
      setErrorMessage(`❌ 연결 실패: ${reason}. 계속되면 관리자에게 문의해 주세요.`);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h2 className="heading-1" style={styles.title}>시스템 설정</h2>
          <p className="subtitle">외부 API 연동 상태를 확인합니다.</p>
        </div>
      </header>

      <div style={styles.content}>
        <section className="card-base" style={styles.apiForm}>
          <h3 className="heading-3" style={{ marginBottom: '20px', color: '#ffffff' }}>Riot 연결 상태</h3>
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
              <span style={{ color: '#00ed64', fontSize: '13.5px', fontWeight: 600 }}>✓ 라이엇 API 연결 테스트 성공!</span>
            )}
            {testStatus === 'failed' && (
              <span style={{ color: '#ff4a4a', fontSize: '13.5px', fontWeight: 600 }}>{errorMessage}</span>
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
  header: { borderBottom: '1px solid #1c4558', paddingBottom: '20px' },
  title: { color: '#ffffff', letterSpacing: '-1px' },
  content: { display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '800px' },
  apiForm: { backgroundColor: '#001e2b', border: '1px solid #1c4558', padding: '24px' },
  testSection: { display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px' },
};
