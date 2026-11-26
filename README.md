# gak.gg — 각

> 볼 각, 뜰 각, 읽을 각.

남자 커뮤니티에서 지금 가장 많이 나오는 말의 **순위**, 앞으로 30일의 **일정**, 하루 두 편 올라오는 **매거진**을 한곳에 모은 사이트. 옛 이름은 DPMBROS(도파민브로스)다.

**Live:** https://dpm-five.vercel.app (도메인 `gak.gg` 연결 전)

| 화면 | 주소 | 데이터 | 만드는 명령 |
|---|---|---|---|
| 키워드 순위 (뜰 각) | `/rank` | `data/trends.json` | `npm run trends` |
| 일정 (볼 각) | `/schedule` | `data/events.json` | `npm run discover`, `npm run crawl` |
| 매거진 (읽을 각) | `/magazine`, `/magazine/<slug>` | `content/articles/*.md` | `scripts/magazine/WRITER.md` 순서 |

문서

- `content/EDITORIAL.md`: 매거진 편집 기준
- `scripts/magazine/WRITER.md`: 글 한 편을 내는 순서(예약 작업이 따라 한다)

---

## 빠르게 띄우기

```bash
npm install
npm run crawl     # data/events.json 생성 (7분쯤)
npm run trends    # data/trends.json 생성 (1분쯤, 한국 IP에서)
npm run dev       # http://localhost:3000
```

데이터 파일이 없어도 사이트는 뜬다. 빈 자리에는 "집계 전" 같은 안내가 나온다.
환경변수는 `.env.example`에 설명이 있다. 이름·주소·문구는 `lib/brand.ts` 한 곳에서 바꾼다.

---

## 구조

```
app/
  page.tsx                  첫 화면: 순위 10 + 대표 글 + 이번 주 일정 + 글 목록
  rank/                     키워드 순위 전체(분류 탭, 대표 글 펼치기)
  schedule/                 30일 일정(관심사, 기대 걸기)
  magazine/                 글 목록, 분류별 목록(c/<분류>), 글 본문, 공유 이미지
  about/ privacy/           소개·편집 원칙, 개인정보 처리방침(애드센스 요건)
  sitemap.ts robots.ts feed.xml/ ads.txt/
  api/events/route.ts       일정 읽기 전용 API

components/                 SiteHeader, RankBoard, RankChart, ArticleCard, ArticleCover, AdSlot, …

lib/
  brand.ts                  이름·주소·문구·광고 ID
  trends.ts                 TrendsFile 형식과 읽기
  articles.ts               글 머리말 스키마와 읽기
  types.ts events.ts hype.ts kst.ts   일정 쪽

scripts/
  trends/                   커뮤니티 인기 글 목록 → 키워드 순위
  magazine/                 check(발행 문턱) · pick(글감) · image(사진) · new(틀) · WRITER.md
  crawl.ts discover.ts sources/ discovery/   일정 수집

content/
  EDITORIAL.md              편집 기준
  articles/                 발행된 글(파일 하나 = 글 하나)

data/
  trends.json trends-history.json   순위와 지난 집계
  events.json candidates.json manual.json   일정
```

### 키워드 순위

`npm run trends`는 커뮤니티 7곳의 인기 글 **목록**만 읽는다(본문·댓글은 받지 않는다). 곳마다 `robots.txt`를 먼저 보고 막아 둔 경로는 쓰지 않는다.
제목에서 키워드를 뽑고, 반응이 큰 글에 나올수록·여러 커뮤니티에 함께 나올수록 점수를 높게 준다. 숫자는 전부 코드가 센다.
`OPENAI_API_KEY`가 있으면 모델이 제목마다 대표 키워드를 붙여 주고, 없으면 규칙만으로 뽑는다.
정치·사건사고 키워드는 `sensitive`로 표시해 기본 순위에서 빼고 대표 글을 싣지 않는다.

```bash
npm run trends:dry                # 파일을 쓰지 않고 순위만 본다
npm run trends -- --explain       # 키워드마다 어떤 제목이 걸렸는지
```

집계는 `.github/workflows/trends.yml`이 2시간마다 돌린다. 깃허브 서버의 접속을 막는 곳(2026-11-26 기준 에펨코리아, 개드립)은 한국에 있는 컴퓨터가 그 두 곳의 목록만 읽어 릴리스 `local-feed`의 첨부 파일로 올리고, 집계가 그 파일로 빈 곳을 메운다. 3시간 넘게 지난 파일은 쓰지 않는다.

```bash
zsh scripts/trends/local-feed.sh --dry   # 두 곳을 읽어 보기만 한다
zsh scripts/trends/local-feed.sh         # 읽어서 릴리스에 올린다(gh 로그인 필요)
```

### 매거진

글 한 편은 `content/articles/YYYY-MM-DD-<slug>.md` 하나다. 머리말에 근거(`sources`) 3개 이상이 있어야 하고, `npm run magazine:check`를 통과한 글만 낸다.

```bash
npm run magazine:pick -- --slot morning     # 글감 후보
npm run magazine:new -- --title "…" --slug … --category 격투기
npm run magazine:image -- "검색어"           # 이용 허락이 확인된 사진 후보
npm run magazine:check -- content/articles/<파일>.md
npm run magazine:selftest                   # 검사 규칙이 제대로 잡는지 시험
```

### 광고

`NEXT_PUBLIC_ADSENSE_CLIENT`와 자리별 번호(`NEXT_PUBLIC_AD_SLOT_*`)가 있어야 광고 코드를 싣는다. 없으면 배포 사이트에는 아무것도 안 나오고, 개발 화면에서만 점선 상자로 자리가 보인다. `/ads.txt`도 게시자 ID가 있을 때만 나온다.

---

## 일정 수집

경기 목록을 그냥 시간순으로 쏟아내면 하루 200경기라 아무도 안 본다.
그래서 일정 쪽의 핵심은 수집이 아니라 **"이건 봐야 함"을 골라내는 점수**다.

### 화제성 점수 (`lib/hype.ts`)

```
점수 = 리그 기본값
     + 라운드 보너스   (결승 +22, 한국시리즈 +25, 더비 +16 …)
     + 팀 화제성       (높은 쪽 100% + 낮은 쪽 50%)
     + 라이벌전        (T1-젠지 +18, 엘클라시코 +20, 잠실더비 +12 …)
     + 편성 시간       (저녁 18~23시 +6)
```

- **70점 이상** → `필수시청` (강조 테두리)
- **50점 이상** → `추천`
- **70점 미만** → 기본 화면에서 숨김. 단, UFC·블랙컴뱃·ROAD FC·ONE·PFL은 핵심 레이더로 유지

내 관심사·저장함·직접 선택한 카테고리에서는 하이프 점수로 일정을 숨기지 않는다.

테이블은 전부 취향이라 계속 손보라고 데이터로 분리해뒀다.
새 리그를 넣으면 `LEAGUE_BASE` 에 한 줄 추가하면 되고, 없으면 기본값 20으로 떨어진다.

> 2군 리그 주의: `LCK CL` 은 팀 이름이 1군과 겹쳐서(`T1 e스포츠 아카데미`)
> 팀 화제성 점수를 그대로 먹는다. 그래서 기본값을 8로 눌러뒀다.
> 다른 2군/여자부 리그를 추가할 때도 같은 함정이 있다.

---

## 데이터 소스

| 소스 | 담당 | 비고 |
|---|---|---|
| TheSportsDB (무료 키 `123`) | EPL, 라리가, 세리에A, 분데스, 챔피언스리그, K리그1, NBA, KBL, KBO, MLB | 축구는 라운드 단위, 농구는 날짜 단위로 읽는다. 팀 이름은 `scripts/sources/team-names.ts`로 한글화 |
| 네이버 e스포츠 API | LCK, 롤드컵, MSI, 발로란트, 오버워치 | 월 단위 조회 |
| Wikipedia (List of UFC events) | UFC 전체 일정 | 날짜만 확정, 시각은 `timeTbd` |
| TheSportsDB (같은 키) | UFC 임박 대회 시각 보정 | 요청을 몰아 보내면 429가 나서 6초 간격으로 보낸다. 수집 전체가 7분쯤 걸린다 |
| BLACK COMBAT 공식 EVENT | 블랙컴뱃 넘버링·라이즈·블랙컵 등 | 날짜·장소 자동 수집, 시각은 `timeTbd` |
| `data/manual.json` | 아시안게임, API 없는 이벤트 | 손으로 입력, 크롤 결과보다 우선 |
| `data/candidates.json` | 게임·테크·빅 이벤트 후보 | API/RSS/AI 정규화 결과, 출처 URL 필수 |
| Apple Newsroom RSS | Apple 행사·제품 발표 | 공식 도메인 원문만 허용 |
| Samsung Global Newsroom RSS | Galaxy Unpacked·제품 발표 | 공식 도메인 원문만 허용 |
| PlayStation Blog RSS | 게임 출시·쇼케이스 | 공식 도메인 원문만 허용 |
| Xbox Wire RSS | 게임 출시·Xbox 쇼케이스 | 공식 도메인 원문만 허용 |
| OpenAI Web search | 격투기·빅 스포츠·모터스포츠·게임·테크 후보 | 커뮤니티는 단서로만 사용, 공식 URL 재검증 필수 |

**네이버 스포츠는 2026-11부터 쓰지 않는다.** 서버가 Node의 기본 TLS 접속에 응답하지 않고(자동 접속 차단으로 보인다), `m.sports.naver.com/robots.txt`도 수집을 전부 막아 두었다. TLS 설정을 바꾸면 뚫리지만 우회하지 않기로 했다. 어댑터 파일(`naver-sports.ts`)은 남겨 두었다.

**비공식·무료 엔드포인트를 쓴다.** 언제든 스키마가 바뀌거나 막힐 수 있다.
그래서 소스 하나가 죽어도 나머지는 계속 수집되고(`crawl.ts`의 try/catch),
크롤 로그에 소스별 건수를 찍는다 — 어느 날 갑자기 `0건`이 뜨면 그 어댑터가 깨진 것이다.

### 새 소스 추가

`scripts/sources/` 에 `(from, to) => Promise<SportEvent[]>` 하나 만들고
`crawl.ts` 의 `jobs` 배열에 등록하면 끝. `hype` 는 0으로 두면 crawl.ts가 일괄 계산한다.

### 비스포츠 이벤트 후보

`npm run discover`는 공식 RSS와 웹 검색을 사용해, OpenAI Structured Outputs로 날짜가
**명시된** 미래 이벤트만 `data/candidates.json`에 병합한다. AI 출력은 곧바로 게시하지 않는다.
코드가 원문 URL·공식 도메인·날짜 범위·카테고리·신뢰도·스키마를 다시 검사한다.
`confidence: "rumored"`이거나 출처 URL이 없는 후보는 게시하지 않는다.
모델의 근거 설명이 날짜가 없다고 스스로 밝힌 후보도 코드에서 한 번 더 제거한다.
연도 없는 종합 일정 페이지, 여러 날짜를 한 제목에 합친 결과, KST 오프셋 없는 날짜도 거부한다.

에펨코리아 같은 커뮤니티는 누락된 후보를 찾는 레이더로만 쓴다. 최종 `sourceUrl`은 검색 과정에서
실제로 확인한 주최사·리그·제조사 공식 도메인이어야 하며, 이 조건을 통과하지 못하면 버린다.
전용 크롤러와 AI 검색이 같은 격투기 대진을 찾으면 날짜·단체·대진명을 비교해 한 건만 게시한다.

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

관심사 UI 확인용 예시 이벤트는 **기본이 꺼짐**이다. 로컬에서 관심사 화면을 볼 때만
`MATCHDAY_PREVIEW_EVENTS=1`로 켠다. 배포 환경에서 켜면 실제로 열리지 않는 경기가
MAIN EVENT 자리에 올라가므로 일정 사이트로서 신뢰를 잃는다.

실제 일정이 하나도 없는 관심사(농구·모터스포츠·빅 스포츠 등)도 미리 선택할 수 있다.
선택 화면에는 `현재 30일 일정 없음`으로 상태를 알리고, 향후 자동 수집으로 일정이 들어오면
저장된 관심사를 바탕으로 내 레이더에 바로 노출한다.

---

## 자동 수집

`.github/workflows/crawl.yml` 이 매일 1번(KST 06시) 아래 순서로 실행한다.

1. 공식 RSS와 AI 웹 검색에서 이벤트 후보 발견 및 `data/candidates.json` 갱신
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
- **블랙컴뱃 개시 시각**: 공식 EVENT 페이지에 날짜·장소만 있어 `시간 미정`으로 표시한다.
- **ROAD FC**: 안정적인 공개 일정 API가 없어 AI 검색의 공식 출처 검증과 `data/manual.json`을 함께 쓴다.
- **NBA**: TheSportsDB 무료 키는 하루 3경기까지만 준다. 그래서 NBA는 하루 3경기만 잡힌다.
- **V리그(배구)**: 자동 수집을 허용한 공개 출처를 찾지 못해 0건이다. 필요하면 `data/manual.json`에 손으로 넣는다.
- **LCK**: 네이버 e스포츠는 살아 있다. 비시즌에는 0건이 정상이다.
- **UFC 선수 이름**: 위키피디아 표기 그대로라 영어로 나온다("Oliveira vs Lopes").
- **팀명 매칭이 부분 문자열 기반**이다. 같은 뿌리의 2군/유스 팀이 1군 점수를 먹을 수 있다.
