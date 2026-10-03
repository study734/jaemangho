import React, { useState } from 'react';
import axios, { type AxiosError } from 'axios';

interface SettingsProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  onResetMembers: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
  apiKey,
  setApiKey,
  onResetMembers
}) => {
  const isDev = import.meta.env.DEV;
  const [apiKeyInput, setApiKeyInput] = useState(apiKey);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setApiKey(apiKeyInput.trim());
    alert('설정이 성공적으로 저장되었습니다!');
  };

  const handleTestAPI = async () => {
    if (isDev && !apiKeyInput) {
      alert('테스트를 위해 Riot API Key를 먼저 입력해 주세요.');
      return;
    }
    
    setTestStatus('testing');
    setErrorMessage('');

    const trimmedKey = apiKeyInput.trim();

    const testUrl = isDev
      ? `/riot-asia/riot/account/v1/accounts/by-riot-id/%EC%98%A4%EC%B1%84/KR1?api_key=${trimmedKey}`
      : `/api/riot?region=asia&path=${encodeURIComponent('/riot/account/v1/accounts/by-riot-id/오채/KR1')}`;

    try {
      await axios.get(testUrl);
      setTestStatus('success');
    } catch (e) {
      const err = e as AxiosError;
      const status = err.response?.status;
      const errorReason =
        status === 401 ? 'Riot API Key 미승인 (HTTP 401)' :
        status === 403 ? 'Riot API Key 만료 (HTTP 403)' :
        status === 404 ? '계정 정보 없음 (HTTP 404)' :
        status === 429 ? '라이엇 서버 요청 제한 (HTTP 429)' :
        !status       ? 'CORS/네트워크 연결 제한' :
        `서버 응답 오류 (HTTP ${status})`;

      setTestStatus('failed');
      setErrorMessage(`❌ 연결 실패: ${errorReason}. 정확한 라이엇 API Key를 다시 입력해 주세요.`);
    }
  };

  const handleReset = () => {
    if (confirm('대원 목록을 완전히 비우고 초기화하시겠습니까?\n(등록하신 대원 목록이 삭제됩니다)')) {
      onResetMembers();
      alert('대원 목록이 초기화되었습니다.');
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h2 className="heading-1" style={styles.title}>시스템 설정</h2>
          <p className="subtitle">애플리케이션 작동 방식 및 외부 API 연동 옵션을 설정합니다.</p>
        </div>
      </header>

      <div style={styles.content}>
        {/* Real API Key Config Panel */}
        <form onSubmit={handleSave} className="card-base" style={styles.apiForm}>
          <h3 className="heading-3" style={{ marginBottom: '20px', color: '#ffffff' }}>Riot API 자격 증명 설정</h3>
          
          {isDev && (
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Riot Games API Key
              <span style={styles.labelSub}> (Riot Developer Portal에서 발급 가능)</span>
            </label>
            <input 
              type="password" 
              className="text-input" 
              placeholder="RGAPI-XXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
            />
            <span style={styles.helpText}>
              * 로컬 개발 전용입니다. 배포 환경의 키는 서버 환경변수(RIOT_API_KEY)로만 관리됩니다.
            </span>
          </div>
          )}

          {/* Test Connection Button */}
          <div style={styles.testSection}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={handleTestAPI}
              disabled={testStatus === 'testing'}
            >
              {testStatus === 'testing' ? '연결 테스트 중...' : 'API 키 연결 테스트'}
            </button>
            
            {testStatus === 'success' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                <span style={{ color: '#00ed64', fontSize: '13.5px', fontWeight: 600 }}>
                  ✓ 라이엇 API 연결 테스트 성공!
                </span>
                {errorMessage && (
                  <span style={{ color: '#ffb703', fontSize: '12px', fontWeight: 500, lineHeight: '1.4', textAlign: 'left' }}>
                    {errorMessage}
                  </span>
                )}
              </div>
            )}

            {testStatus === 'failed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                <span style={{ color: '#ff4a4a', fontSize: '13.5px', fontWeight: 600 }}>
                  {errorMessage}
                </span>
              </div>
            )}
          </div>

          {isDev && (
            <button type="submit" className="btn btn-primary" style={{ marginTop: '24px', width: '100%', height: '44px' }}>
              연결 설정 저장
            </button>
          )}
        </form>

        {/* Data Reset Section */}
        <section className="card-base" style={styles.resetCard}>
          <h3 className="heading-3" style={{ color: '#ff4a4a', marginBottom: '10px' }}>데이터 초기화</h3>
          <p className="body-sm" style={{ marginBottom: '16px' }}>
            크루원 목록이 손상되었거나 직접 편집한 내용을 지우고 처음 재망호 기본 대원 세팅으로 되돌리려면 초기화를 진행하세요.
          </p>
          <button className="btn btn-secondary" style={styles.resetBtn} onClick={handleReset}>
            대원 데이터 기본값 복구
          </button>
        </section>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '32px',
    overflowY: 'auto' as const,
    height: '100vh',
  },
  header: {
    borderBottom: '1px solid #1c4558',
    paddingBottom: '20px',
  },
  title: {
    color: '#ffffff',
    letterSpacing: '-1px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '32px',
    maxWidth: '800px',
  },
  apiForm: {
    backgroundColor: '#001e2b',
    border: '1px solid #1c4558',
    padding: '24px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  label: {
    fontSize: '13.5px',
    fontWeight: 600,
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
  },
  labelSub: {
    fontSize: '12px',
    color: '#7c8c9a',
    fontWeight: 400,
    marginLeft: '4px',
  },
  helpText: {
    fontSize: '11px',
    color: '#7c8c9a',
    marginTop: '4px',
    lineHeight: '1.4',
  },
  testSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginTop: '16px',
  },
  resetCard: {
    backgroundColor: '#001e2b',
    border: '1px solid #1c4558',
    padding: '24px',
  },
  resetBtn: {
    borderColor: '#ff4a4a',
    color: '#ff4a4a',
  }
};
