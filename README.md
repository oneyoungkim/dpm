# DPMBROS — 도파민브로스

축구 · 야구 · LCK · UFC까지, 앞으로 한 달간 열리는 경기를 **화제성 순으로** 한 화면에 정리하는 사이트.

**Live:** https://dpm-five.vercel.app

경기 목록을 그냥 시간순으로 쏟아내면 하루 200경기라 아무도 안 본다.
그래서 이 프로젝트의 핵심은 수집이 아니라 **"오늘 이건 봐야 함"을 골라내는 점수**다.

---

## 빠르게 띄우기

```bash
npm install
npm run crawl     # data/events.json 생성 (2~3분)
npm run dev       # http://localhost:3000
```

`npm run crawl` 을 한 번도 안 돌리면 사이트는 뜨지만 "수집된 일정이 없다" 화면이 나온다.

---

## 구조

```
scripts/
  crawl.ts              모든 소스를 긁어 data/events.json 하나로 합침
  discover.ts           공식 RSS → AI 구조화 → 검증된 이벤트 후보 병합
  http.ts               재시도·타임아웃 공용 fetch
  discovery/
    official-feeds.ts   Apple·Samsung·PlayStation·Xbox 공식 RSS 수집
    extract-events.ts   날짜가 명시된 이벤트만 Structured Outputs로 추출
    candidate-schema.ts 후보 파일의 런타임 스키마와 타입
  sources/
    naver-sports.ts     KBO·MLB·NPB·K리그·EPL·라리가·세리에A·분데스·MLS·농구·배구
    naver-esports.ts    LCK / LCK CL / 롤드컵 / MSI / 발로란트 / 오버워치
    fighting.ts         UFC (위키피디아 일정표 + TheSportsDB 시각 보정)
    manual.ts           data/manual.json 오버레이 (아시안게임 등 API 없는 이벤트)

lib/
  types.ts              SportEvent — 모든 소스가 여기로 정규화된다
  hype.ts               ★ 화제성 점수. 리그 가중치 · 라이벌전 · 팀 화제성 · 편성시간
  kst.ts                한국시간 고정 유틸
  events.ts             사이트가 데이터를 읽는 유일한 통로
  sport-style.ts        종목별 색/아이콘

app/
  page.tsx              오늘의 픽 + 한 달 달력 + 날짜별 목록
  api/events/route.ts   앱이 쓸 읽기 전용 API

data/
  events.json           크롤 산출물 (커밋 대상)
  manual.json           손으로 채우는 이벤트
```

### 데이터 흐름

```
공식 RSS ──► AI 구조화 ──► 코드 검증 ──► data/candidates.json
                                                │
스포츠 크롤러 ──────────────────────────────────┼──► data/events.json ──► 화면 / API
                                                │
                                  data/manual.json (덮어쓰기 우선)
```

사이트는 **events.json 하나만** 읽는다. 크롤이 실패해도 직전 스냅샷으로 계속 서비스된다.
크롤 결과가 0건이면 기존 파일을 덮어쓰지 않고 종료한다 — 전부 실패한 날 빈 사이트를 배포하는 게 최악이라서.

---

## 화제성 점수 (`lib/hype.ts`)

```
점수 = 리그 기본값
     + 라운드 보너스   (결승 +22, 한국시리즈 +25, 더비 +16 …)
     + 팀 화제성       (높은 쪽 100% + 낮은 쪽 50%)
     + 라이벌전        (T1-젠지 +18, 엘클라시코 +20, 잠실더비 +12 …)
     + 편성 시간       (저녁 18~23시 +6)
```

- **70점 이상** → `필수시청` (강조 테두리)
- **50점 이상** → `추천`
- **70점 미만** → 기본 화면에서 숨김, "모든 일정"에서만 노출

테이블은 전부 취향이라 계속 손보라고 데이터로 분리해뒀다.
새 리그를 넣으면 `LEAGUE_BASE` 에 한 줄 추가하면 되고, 없으면 기본값 20으로 떨어진다.

> 2군 리그 주의: `LCK CL` 은 팀 이름이 1군과 겹쳐서(`T1 e스포츠 아카데미`)
> 팀 화제성 점수를 그대로 먹는다. 그래서 기본값을 8로 눌러뒀다.
> 다른 2군/여자부 리그를 추가할 때도 같은 함정이 있다.

---

## 데이터 소스

| 소스 | 담당 | 비고 |
|---|---|---|
| 네이버 스포츠 API | KBO, MLB, NPB, K리그, EPL, 라리가, 세리에A, 분데스, MLS, 농구, 배구 | 실시간 스코어까지 나옴 |
| 네이버 e스포츠 API | LCK, 롤드컵, MSI, 발로란트, 오버워치 | 월 단위 조회 |
| Wikipedia (List of UFC events) | UFC 전체 일정 | 날짜만 확정, 시각은 `timeTbd` |
| TheSportsDB (무료 키) | UFC 임박 대회 시각 보정 | 무료 티어는 응답 건수 제한이 커서 보정용으로만 |
| `data/manual.json` | 아시안게임, 국내 격투기 단체 등 | 손으로 입력, 크롤 결과보다 우선 |
| `data/candidates.json` | 게임·테크·빅 이벤트 후보 | API/RSS/AI 정규화 결과, 출처 URL 필수 |
| Apple Newsroom RSS | Apple 행사·제품 발표 | 공식 도메인 원문만 허용 |
| Samsung Global Newsroom RSS | Galaxy Unpacked·제품 발표 | 공식 도메인 원문만 허용 |
| PlayStation Blog RSS | 게임 출시·쇼케이스 | 공식 도메인 원문만 허용 |
| Xbox Wire RSS | 게임 출시·Xbox 쇼케이스 | 공식 도메인 원문만 허용 |

**비공식 엔드포인트를 쓴다.** 언제든 스키마가 바뀌거나 막힐 수 있다.
그래서 소스 하나가 죽어도 나머지는 계속 수집되고(`crawl.ts`의 try/catch),
크롤 로그에 소스별 건수를 찍는다 — 어느 날 갑자기 `0건`이 뜨면 그 어댑터가 깨진 것이다.

### 새 소스 추가

`scripts/sources/` 에 `(from, to) => Promise<SportEvent[]>` 하나 만들고
`crawl.ts` 의 `jobs` 배열에 등록하면 끝. `hype` 는 0으로 두면 crawl.ts가 일괄 계산한다.

### 비스포츠 이벤트 후보

`npm run discover`는 공식 RSS를 읽은 뒤, OpenAI Structured Outputs로 본문에 날짜가
**명시된** 미래 이벤트만 `data/candidates.json`에 병합한다. AI 출력은 곧바로 게시하지 않는다.
코드가 원문 URL·공식 도메인·날짜 범위·카테고리·신뢰도·스키마를 다시 검사한다.
`confidence: "rumored"`이거나 출처 URL이 없는 후보는 게시하지 않는다.

AI가 필요한 곳은 자연어 공지의 날짜·행사명 정규화뿐이다. 이미 구조화된 스포츠 일정은
기존 API/크롤러를 그대로 사용한다. 이 하이브리드가 비용과 환각 위험을 함께 줄인다.

```bash
npm run discover:feeds      # 공식 피드 연결만 확인, AI 호출/파일 쓰기 없음
npm run discover:dry        # AI 결과까지 확인, 파일 쓰기 없음
npm run discover            # 검증된 후보를 candidates.json에 병합
npm run crawl               # 후보와 스포츠 일정을 events.json으로 게시
```

`.env.example`을 참고해 `OPENAI_API_KEY`를 로컬 환경 또는 GitHub Actions의
Repository secret으로 등록한다. 키가 없으면 발견 단계는 성공 종료하며 기존 후보를 보존한다.
모델 기본값은 데이터 추출용 `gpt-5.4-nano-2026-03-17` 고정 스냅샷이다.
한 번에 읽는 기사 수는 `DISCOVERY_FEED_LIMIT`, 미래 검색 범위는
`DISCOVERY_FORWARD_DAYS`로 제한한다.

관심사 UI 확인용 상대 날짜 예시는 기본적으로 켜져 있다. 실제 출시 환경에서는
`MATCHDAY_PREVIEW_EVENTS=0`으로 끄고 검증된 후보 데이터만 노출한다.

---

## 자동 수집

`.github/workflows/crawl.yml` 이 매일 1번(KST 06시) 아래 순서로 실행한다.

1. 공식 RSS에서 이벤트 후보 발견 및 `data/candidates.json` 갱신
2. 스포츠 크롤과 후보를 합쳐 `data/events.json` 갱신
3. 두 JSON에 실제 변경이 있을 때만 커밋

서버리스 배포는 파일시스템이 읽기 전용이라 런타임 크롤이 안 된다.
그래서 **CI에서 긁어 커밋 → 배포 자동 갱신** 구조를 쓴다.
상시 서버에 올린다면 이 워크플로 대신 cron으로 `npm run crawl` 을 돌려도 된다.

```bash
npm run crawl              # 어제 ~ +35일
npm run crawl -- --days 60 # 수집 창 늘리기
npm run crawl:dry          # 파일 안 쓰고 요약만
```

---

## API

앱이 쓸 읽기 전용 엔드포인트.

```
GET /api/events
GET /api/events?sport=야구,e스포츠&minHype=70&from=2026-08-20&to=2026-08-31&limit=50
```

| 파라미터 | 설명 |
|---|---|
| `sport` | 쉼표 구분. 야구/축구/e스포츠/격투기/농구/배구/기타 |
| `minHype` | 이 점수 이상만 |
| `from` / `to` | `YYYY-MM-DD` |
| `limit` | 기본 200, 최대 500 |

---

## 관심사와 알림

관심사는 `matchday.interests.v1`, 기대 중 이벤트는 `matchday.saved.v1`에 저장된다.
현재는 둘 다 **브라우저 localStorage** 기반이라 서버는 사용자의 선택을 모른다.
서버는 누가 뭘 구독했는지 모른다.

앱/푸시로 가려면 이 순서가 자연스럽다:

1. 사용자 식별 + 구독 테이블 (`user_id`, `event_id` 또는 `관심 팀/리그`)
2. `POST /api/alarms` 로 localStorage 목록을 서버에 올림
3. 크롤 직후 "N분 뒤 시작" 이벤트를 뽑아 푸시 발송 워커 실행
4. 웹은 Web Push(VAPID), 앱은 FCM/APNs

경기별 구독보다 **팀·리그 구독**이 실사용에 더 맞을 가능성이 높다
("토트넘 경기 다 알려줘"가 "이 경기 하나 알려줘"보다 흔하다). 붙이기 전에 한 번 정하고 가는 게 좋다.

---

## 알려진 한계

- **UFC 개시 시각**: 위키피디아엔 날짜만 있어 대부분 `시간 미정`으로 뜬다. 임박한 대회만 TheSportsDB로 보정된다.
- **국내 격투기(블랙컴뱃·로드FC)**: 공개 API가 없다. `data/manual.json` 에 손으로 넣어야 한다.
- **NBA·V리그·KBL**: 어댑터는 붙어 있지만 비시즌엔 네이버가 일정을 안 내려줘 0건이다. 시즌 시작하면 자동으로 채워진다.
- **UEFA 챔피언스리그**: 네이버가 조추첨 후에야 일정을 올린다. `categoryName` 에 "챔피언스"가 들어오면 자동으로 `ucl` 가중치를 먹도록 해뒀다.
- **팀명 매칭이 부분 문자열 기반**이다. 같은 뿌리의 2군/유스 팀이 1군 점수를 먹을 수 있다.
