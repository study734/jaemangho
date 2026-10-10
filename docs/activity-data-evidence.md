# 활동 데이터 설계를 위한 외부 근거

확인일: 2026-10-09. 이 문서는 제공사의 공식 문서·약관에서 확인한 제약을 적는다. 수집 주기, 보존 기간, 용량 목표는 별도의 제품 결정이며 이 문서의 숫자가 서비스의 보장이나 승인으로 해석되어서는 안 된다.

## 제공사별 확인 사항

| 출처 | 확인된 사실 | 설계에 주는 영향 |
| --- | --- | --- |
| Riot | LoL 개발자 문서는 PUUID 사용을 권장하고, 개인 키 용례로 본인 경기 이력·집계 통계·LFG를 예시로 든다. 제품은 Developer Portal에 등록해야 하고 기능 변경도 제품 페이지에서 심사를 받아야 한다. [LoL 개발자 문서](https://developer.riotgames.com/docs/lol), [일반 정책](https://developer.riotgames.com/policies/general) | 경기 ID를 기준으로 중복을 제거한 최소 파생 기록을 검토하되, **장기 저장 기능을 제품 설명에 반영하고 Riot 심사 상태를 확인한 뒤** 운영 수집을 시작한다. |
| Riot | 커스텀 경기 이력을 공개하려면 해당 플레이어가 LoL에서 이를 명시적으로 공유하도록 동의해야 한다. Riot은 삭제 요청 대상 식별자를 개발자에게 전달한다고 명시한다. API 이용 종료 시 보유한 Game Information을 삭제하도록 규정한다. [LoL 개발자 문서](https://developer.riotgames.com/docs/lol), [API 약관](https://developer.riotgames.com/terms) | 커스텀 경기는 기본 수집·공개 대상에서 제외하고, Riot 유래 데이터의 출처·삭제 경로를 기록한다. 무기한 보존을 보장할 수 없다. |
| Steam | `GetOwnedGames`는 사용자의 소유 게임/게임 상세 정보가 조회자에게 보이는 경우에만 목록을 반환한다. 무료 게임은 기본적으로 제외되며, 플레이한 무료 게임을 포함하는 옵션이 있다. 비공개 게임은 소유·플레이 시간·활동이 숨겨진다. [IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService), [비공개 게임 안내](https://help.steampowered.com/en/faqs/view/1150-C06F-4D62-4966) | 응답 누락을 플레이 시간 0 또는 게임 삭제로 해석하지 않는다. 이전의 누적 플레이 시간과 새로 관측한 값의 차이만 **관측된 변화량**으로 표기한다. 실제 플레이 세션의 시작·종료 시각은 이 API로 확정할 수 없다. |
| Steam | Web API 약관은 사용자 요청에 따라 해당 사용자의 데이터를 조회하고, 저장 내용을 사용자에게 알리며, 비공개 데이터 사용과 저장 국가를 개인정보 처리방침에 명시하도록 요구한다. [Steam Web API 약관](https://steamcommunity.com/dev/apiterms) | 연결 사용자에 대한 주기적 재조회와 이력 저장이 약관상 허용되는 범위를 출시 전에 검토하고, 고지·연결 해제·삭제 흐름을 먼저 설계한다. |
| Steam | Steam은 OpenID 제공자로 작동하며 인증된 사용자의 Claimed ID에서 64비트 SteamID를 얻을 수 있다고 안내한다. [Steam Web API 문서](https://steamcommunity.com/dev) | 사용자가 입력하거나 다른 로그인 사용자가 지정한 `owner_id` 대신 SteamID를 검증할 방법으로 활용할 수 있다. OpenID 인증 자체는 장기 저장에 대한 별도 요청을 대신하지 않는다. |
| OpenID 2.0 | 응답은 `return_to`, 공급자, 서명 대상 필드, `response_nonce`를 확인하고 공급자에 `check_authentication`으로 직접 검증할 수 있다. [OpenID Authentication 2.0](https://openid.net/specs/openid-authentication-2_0.html) | Steam 콜백을 서버에서 검증하고 일회용 상태·nonce를 보관해 재사용을 막는다. |
| Discord | 개발자 정책은 API 데이터를 명시한 기능에 필요한 범위로 사용하도록 제한하며, Discord 이용자의 신원·관계를 프로파일링하는 용도를 금지한다. 메시지 내용의 AI 학습도 별도 명시 허가 없이 금지한다. [Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy) | 장기 지표는 메시지 원문이나 관계 그래프보다 서비스 기능과 직접 연결되는 최소 집계에 한정하고, 식별 가능한 장기 통계의 필요성을 따로 검토한다. |
| Discord | 메시지 내용 접근은 privileged intent의 영향을 받지만, 권한이 없는 경우에도 이벤트에서 작성자·타임스탬프 같은 다른 필드를 받을 수 있다고 설명한다. 2026년에는 privileged intent 심사 기준도 바뀌었다. [Message Content FAQ](https://support-dev.discord.com/hc/en-us/articles/4404772028055-Message-Content-Intent-FAQ), [2026년 변경 안내](https://discord.com/blog/updated-requirements-to-how-apps-access-data-in-servers) | 원문 접근이 앞으로도 지속된다고 가정하지 말고 현재 앱의 intent·설치 규모·실제 수신 필드를 검증한다. Discord 자체의 보존 정책과 재망호의 60일 메타데이터 보존 규칙을 혼동하지 않는다. |
| Neon | 2026-10-02 발표에서 Free 프로젝트당 DB 저장공간을 1GB, 컴퓨트를 월 100 CU-hour, 즉시 복구 기간을 6시간으로 명시한다. [Neon 발표](https://neon.com/blog/neon-free-plan-1-gb-per-project) | 300MB 목표와 600MB 재검토점은 **재망호 운영 기준**이다. Neon의 단기 복구 기능은 장기 외부 백업을 대체하지 않는다. 실제 사용량·컴퓨트는 콘솔에서 측정한다. |
| Vercel | Hobby Cron은 작업당 하루 1회까지, 지정한 시간대의 어느 시점에나 실행될 수 있다. Cron은 Function을 호출하므로 Function 사용량 제한도 적용된다. 중복 호출 가능성도 문서화돼 있다. [Cron 요금·한도](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Cron 관리](https://vercel.com/docs/cron-jobs/manage-cron-jobs) | 일일 수집은 재시도와 중복 실행에 안전해야 한다. 정확한 시각이나 매일 반드시 1회 성공한다는 가정으로 데이터 모델을 만들지 않는다. |
| Cloudflare R2 | Standard 등급의 월 무료 제공량은 10GB-month, Class A 100만 건, Class B 1,000만 건이다. Infrequent Access에는 이 무료 구간이 적용되지 않는다. [R2 가격](https://developers.cloudflare.com/r2/pricing/) | 첨부 파일·외부 백업을 도입할 때 Standard 기준으로 용량과 요청을 별도 계측한다. 백업 암호화·복구 검증은 서비스 한도가 아닌 운영 요구다. |

## 설계 전 확인해야 할 사실

1. **Riot 등록 내용:** 저장소의 `RIOT_PRODUCT_KEY_GUIDE.md` 예시 문구는 Riot 데이터를 저장하지 않는다고 설명한다. 실제 제출·승인된 제품 설명인지는 확인되지 않았다. 장기 경기 저장을 시작하기 전에 Developer Portal의 등록 내용·키 종류·기능 심사 상태를 확인한다. 예시 문구가 제출됐다고 단정하지 않는다. [Riot 일반 정책](https://developer.riotgames.com/policies/general)
2. **활동량과 크기:** 월 5천~1만 건, 기록당 1~2KB, 연 60~240MB는 실측이 아닌 가정이다. DB의 현재 크기, 대표 행·인덱스 크기, 월별 실제 활동 발생량을 측정한 다음 저장량을 다시 산출한다. 원본 API JSON을 그대로 장기 저장하면 이 가정을 적용할 수 없다.
3. **정보 제공 범위:** LoL 경기의 공동 플레이는 같은 경기 ID와 참가자 PUUID로 확인 가능한 경우에만 기록한다. Steam 누적 플레이 시간의 변화와 Discord 메시지 수는 게임 세션이나 공동 플레이의 직접 증거가 아니다.
4. **삭제와 보존:** 사용자 연결 해제, 플랫폼의 삭제 요청, 약관 변경, 앱 종료 때 외부 유래 기록 및 파생 집계에 무엇을 삭제할지 데이터 계보별로 정해야 한다. 장기 저장은 영구 보존 약속이 아니다.

## 문서 신뢰도 메모

Context7 CLI로 Riot·Steamworks·Neon 문서를 조회했다. Riot 조회는 LoL 질문에 VALORANT 예시가 주로 반환됐고, Steamworks는 해당 질의와 일치하는 문서를 반환하지 않았다. Neon 색인에는 **0.5GB**로 된 오래된 요금표가 남아 있었다. 따라서 위 표의 해당 사실은 링크한 제공사의 현재 공식 페이지에서 직접 확인했으며, Context7 색인 결과를 최신 한도의 근거로 사용하지 않았다.
