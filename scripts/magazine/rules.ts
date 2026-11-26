/**
 * 매거진 검사(check.ts)가 쓰는 낱말 목록과 기준값.
 * 편집자가 고칠 곳은 이 파일 하나다. 규칙의 근거는 content/EDITORIAL.md 의 장 번호(section)로 적는다.
 *
 * 걸리는 방식(mode)
 *   - "first-hit": 한 번만 나와도 실패(오류, 종료 코드 1).
 *   - "clustered": 글 전체에서 같은 무리(rule)가 threshold번 이상 나오면 실패.
 *                  그보다 적으면 한 군데씩 경고로만 알린다(종료 코드 0).
 *   - "warn":      몇 번이 나와도 경고만. 사람이 보고 판단해야 하는 말.
 *
 * literalIf: 그 말이 든 "문장"이 이 식 가운데 하나에 걸리면 글자 그대로 쓴 것으로 보고 세지 않는다.
 *   예) "체급"이 라이트급·kg과 같은 문장에 있으면 격투기의 진짜 체급이다.
 * skipQuotes: 따옴표 안(실제로 한 말)은 문체 규칙에서 뺀다. 금지 주제어는 따옴표 안도 본다.
 */

export type RuleMode = "first-hit" | "clustered" | "warn";

export interface PhrasePattern {
  re: RegExp;
  /** 보고서에 찍는 이름. 없으면 걸린 글자 그대로 */
  label?: string;
  literalIf?: RegExp[];
}

export interface PhraseRule {
  id: string;
  /** EDITORIAL.md 장 번호 */
  section: string;
  title: string;
  mode: RuleMode;
  /** clustered일 때 실패로 바뀌는 횟수 */
  threshold?: number;
  skipQuotes: boolean;
  /** 이 규칙이 보는 곳. 기본은 본문만 */
  scope?: "body" | "all";
  /** 사람에게 남기는 한 줄 설명 */
  hint: string;
  patterns: PhrasePattern[];
}

/** 한국어 명사 뒤에 붙는 조사·문장부호. 이 앞에서만 낱말이 끝났다고 본다. */
const AFTER_NOUN = String.raw`(?=[이가을를은는의도로와과에만]|으로|\s|[,.!?·:;)"”’']|$)`;
const NOT_AFTER_HANGUL = String.raw`(?<![가-힣])`;

/** 앞뒤가 다른 한글 낱말에 붙지 않은 명사 */
function noun(word: string, after = AFTER_NOUN): RegExp {
  return new RegExp(`${NOT_AFTER_HANGUL}${word}${after}`);
}

// ─── 기준값 ─────────────────────────────────────────────

export const LIMITS = {
  /** 6장: 본문 공백 제외 글자 수 */
  bodyMin: 2000,
  bodyMax: 4500,
  /** 6장: 소제목(##) 개수 */
  h2Min: 3,
  h2Max: 5,
  /** 4장: 근거 수, 서로 다른 사이트 수 */
  minSources: 3,
  minHosts: 2,
  /** 5장 기본 말투: "~습니다."로 끝나는 문장이 이만큼 이어지면 실패 */
  seumnidaStreak: 7,
  /** 5-9: 한 문단에서 접속어로 여는 문장이 이 수를 넘으면 실패 */
  connectorOpenersPerParagraph: 3,
  /** 5-9: 이 글자 수(공백 제외) 이하 단정문이 shortStack개 이어지면 경고 */
  shortSentenceChars: 12,
  shortStack: 4,
  /** 2장: 최근 글과 겹침 */
  recentTitleDays: 30,
  /** 제목 두 글자 묶음 겹침 비율(Dice). 이 값 이상이면 같은 주제로 본다 */
  titleSimilarity: 0.5,
  /** 태그가 이 개수 이상 겹치면 같은 주제로 본다 */
  tagOverlap: 2,
  /** 이 일수 안에서 태그가 겹치면 실패, recentTitleDays 안이면 경고 */
  recentTagErrorDays: 14,
  /** 근거 주소 확인 */
  urlTimeoutMs: 15_000,
  urlConcurrency: 4,
} as const;

/** 접속어로 여는 문장(5-9) */
export const CONNECTOR_OPENERS = /^(또한|그리고|한편|하지만)[\s,]/;

/** 첫 문단에서 걸리는 여는 말(6장) */
export const OPENING_GREETING = [
  /안녕하세요|반갑습니다/,
  /(오늘은|이번 글에서는|이번 글에선|이 글에서는|이 글에선)[^.!?]{0,40}(알아보|살펴보|소개|이야기해 보|다뤄 보|정리해 보|짚어 보)/,
];

/** 제목에 쓰지 않는 것(6장) */
export const TITLE_BANNED = [/!/, /충격/, /소름/];

// ─── 5장 문장 규칙 ──────────────────────────────────────

export const PHRASE_RULES: PhraseRule[] = [
  {
    id: "dash-arrow",
    section: "5-10",
    title: "줄표·화살표",
    mode: "first-hit",
    skipQuotes: false,
    hint: "쉼표나 문장으로 풀어 쓴다",
    patterns: [
      { re: /—/, label: "줄표(—)" },
      { re: /―/, label: "줄표(―)" },
      { re: /→|⇒|⟶|➔|➡/, label: "화살표" },
      { re: /(?<![<!-])->(?!>)/, label: "화살표(->)" },
    ],
  },
  {
    id: "en-dash",
    section: "5-10",
    title: "짧은 줄표(–)",
    mode: "warn",
    skipQuotes: false,
    hint: "숫자 범위면 '~'로, 문장 사이면 쉼표로 바꾼다",
    patterns: [{ re: /–/, label: "짧은 줄표(–)" }],
  },
  {
    id: "relative-day",
    section: "4",
    title: "오늘·어제·내일",
    mode: "warn",
    skipQuotes: true,
    hint: "글은 며칠 뒤에도 읽힌다. '오늘' 대신 '11월 26일'처럼 날짜로 쓴다",
    patterns: [{ re: /(?<![가-힣])(오늘|어제|내일|그저께|모레)(?=[은는이가도에의,\s(]|$)/, label: "날짜 대신 쓴 말" }],
  },
  {
    id: "double-passive",
    section: "5-6",
    title: "이중 피동",
    mode: "first-hit",
    skipQuotes: false,
    hint: "되다·보이다·잊히다처럼 한 번만 피동으로 쓴다",
    patterns: [
      {
        // "지다"가 활용하면 지·진·집·져·졌·질·짐으로 글자가 바뀐다(되어집니다, 보여졌다)
        re: /(되어|보여|잊혀|쓰여|믿겨|짜여|불려|나뉘어)[지진집져졌질짐]/,
      },
    ],
  },
  {
    id: "progress-remark",
    section: "5-8",
    title: "진행 멘트·예고",
    mode: "first-hit",
    skipQuotes: true,
    hint: "진행 멘트 없이 바로 사실을 쓴다",
    patterns: [
      { re: /알아보겠습니다|살펴보겠습니다|알아봅시다|살펴봅시다|알아보도록 하겠|살펴보도록 하겠|알아볼까요|살펴볼까요/ },
      { re: /이제\s[^.!?]{1,20}[을를]\s?보겠습니다/ },
      { re: /뒤에서 다시|뒤에서 자세히|다음 장에서|아래에서 자세히/ },
    ],
  },
  {
    id: "closing-formula-hard",
    section: "5-4",
    title: "문단을 닫는 공식(한 번도 안 됨)",
    mode: "first-hit",
    skipQuotes: true,
    hint: "다음 일정·숫자 같은 사실로 닫는다",
    patterns: [{ re: /귀추가 주목/ }, { re: /시간이 (답해|말해) ?줄/ }],
  },
  {
    id: "haeyo",
    section: "5",
    title: "해요체",
    mode: "first-hit",
    skipQuotes: true,
    hint: "기본은 ~니다, 섞을 때는 ~죠·~거든요·~는데요",
    patterns: [
      {
        re: /(?:해요|예요|에요|어요|아요|네요|세요|래요|군요)(?=[.!?…]["”’')]*(?:\s|$)|["”’')]*$)/,
        label: "~해요/~예요 끝맺음",
      },
    ],
  },
  {
    id: "abstract-word",
    section: "5-1",
    title: "비유로 쓴 추상어",
    mode: "clustered",
    threshold: 3,
    skipQuotes: true,
    hint: "그 말이 가리키는 실제 대상(누가·무엇·몇)으로 바꾼다. 글자 그대로 쓴 체급·무게·온도는 세지 않는다",
    patterns: [
      {
        re: noun("체급"),
        literalIf: [
          /(스트로|플라이|밴텀|페더|라이트|웰터|미들|헤비|크루저|슈퍼|주니어|무제한)급/,
          /\d\s*(kg|킬로|파운드|lb)/i,
          /체중|계체|감량|증량/,
          /(두|세|네|여러) 체급|체급 (챔피언|타이틀|변경|전향|이동|구분|한도|상한)|체급을 (올|내|옮|바꾸|나누|나눠)/,
        ],
      },
      { re: noun("판도", String.raw`(?=[가를는의도에]|\s|[,.]|$)`) },
      { re: noun("지형"), literalIf: [/산악|오프로드|해발|고도|비포장|등고선|지형지물|험로/] },
      { re: noun("풍경"), literalIf: [/경치|경관|사진|해변|바다|하늘|산맥|창밖/] },
      { re: noun("민낯") },
      { re: noun("궤적"), literalIf: [/공|타구|투구|슛|궤도|탄도|비행|포물선|로켓|위성/] },
      { re: noun("서사") },
      { re: new RegExp(`${NOT_AFTER_HANGUL}결(?=[이을은]\\s|이\\s?다르|이\\s?같)`), label: "결" },
      {
        re: noun("온도"),
        literalIf: [/\d\s*(°|℃|도)/, /기온|섭씨|화씨|수온|체온|냉각|발열|온도계|영하|영상/],
      },
      {
        re: noun("무게"),
        literalIf: [/\d\s*(kg|킬로|g\b|그램|톤|t\b|파운드|lb)/i, /체중|중량|공차|계체|무게중심|무게 중심|그램/],
      },
      { re: noun("열쇠"), literalIf: [/스마트키|자물쇠|도어|문을|키리스|자동차 키|열쇠고리/] },
      { re: noun("기둥"), literalIf: [/필러|건물|구조물|경기장|지붕|골대|골포스트/] },
      { re: noun("뿌리", String.raw`(?=[가를의도]|\s|[,.]|$)`), literalIf: [/식물|나무|뿌리채소|인삼|모발|치아|모근/] },
      { re: noun("갈림길") },
      { re: noun("분수령") },
      { re: noun("신호탄") },
      { re: noun("변곡점") },
      { re: noun("지각변동") },
    ],
  },
  {
    id: "empty-wrapup",
    section: "5-2",
    title: "새 정보 없이 매듭짓는 문장",
    mode: "clustered",
    threshold: 3,
    skipQuotes: true,
    hint: "그 문장을 지우거나 근거 숫자로 바꾼다",
    patterns: [
      { re: /중요한 (것|건|점)은/ },
      { re: /핵심은/ },
      { re: /분명합니다|분명하다\./ },
      { re: /시사합니다|시사하는 바/ },
      { re: /많은 것을 (보여 ?줍니다|말해 ?줍니다)/ },
      { re: /주목할 ?만(합니다|하다)/ },
      { re: /의미심장/ },
    ],
  },
  {
    id: "not-but",
    section: "5-3",
    title: "판단 문장의 \"A가 아니라 B\"",
    mode: "clustered",
    threshold: 3,
    skipQuotes: true,
    hint: "B만 말한다. 숫자·날짜를 가르는 사실 문장은 세지 않는다",
    patterns: [
      {
        re: /(?<!뿐만?\s?)아니라(?!면|고|서)/,
        label: "~가 아니라",
        // 숫자·날짜가 든 문장은 사실을 가르는 문장으로 본다
        literalIf: [/\d/, /(월|일|년|시|분|초|위|번|회|경기)(이|가) 아니라/],
      },
    ],
  },
  {
    id: "closing-formula",
    section: "5-4",
    title: "문단을 닫는 공식",
    mode: "clustered",
    threshold: 3,
    skipQuotes: true,
    hint: "다음 일정·1년 전 숫자 같은 사실로 닫는다",
    patterns: [
      { re: /셈입니다|셈이다\./, label: "~인 셈입니다" },
      { re: /이유입니다\.|이유다\./, label: "~하는 이유입니다" },
      { re: /결국\s[^.!?]{0,40}(으로|로) 이어(집니다|진다)/, label: "결국 ~로 이어집니다" },
    ],
  },
  {
    id: "cliche",
    section: "5-5",
    title: "식상한 말",
    mode: "clustered",
    threshold: 3,
    skipQuotes: true,
    hint: "무엇이 몇에서 몇으로 바뀌었는지로 바꾼다",
    patterns: [
      { re: /포문을 (열|연)/ },
      { re: /도전장을 (내밀|내민)/ },
      { re: /급물살/ },
      { re: /시동을 (걸|건)/ },
      { re: /한 ?획을 (긋|그)/ },
      { re: /시대가 (왔|온다|열렸)/ },
      { re: /기로에 (섰|서 있|선)/ },
      { re: /선택이 아닌 필수/ },
      { re: /그 어느 때보다/ },
      { re: /역대급/ },
      { re: /충격/, literalIf: [/흡수|방지|센서|내충격|충격에 (강|견디)|낙하|충격파|충격량/] },
      { re: /압도적/ },
      { re: /놀라운|놀랍(게|습니다|다)/ },
    ],
  },
  {
    id: "translationese",
    section: "5-6",
    title: "번역투·부풀린 서술어",
    mode: "clustered",
    threshold: 3,
    skipQuotes: true,
    hint: "주어를 앞세우고 짧은 동사로 바꾼다(\"~를 보유하고 있다\" 대신 \"~가 있다\")",
    patterns: [
      { re: /에 의해|에 의하여/ },
      { re: /[을를] 가지고 있/ },
      { re: /가장 [^.!?]{1,20} 중 하나/, label: "가장 ~한 것 중 하나" },
      { re: /[을를] 진행(했|하였|한다|합니다|했습니다)/ },
      { re: /(으로|로) 자리 ?(잡고|매김하고) 있/ },
      { re: /[을를] 보유하고 있/ },
    ],
  },
  {
    id: "pronoun",
    section: "5-7",
    title: "사람을 그·그녀·그들로 받기",
    mode: "clustered",
    threshold: 3,
    skipQuotes: true,
    hint: "이름으로 다시 부른다",
    patterns: [
      { re: /(?<![가-힣])그(?=[는가를의](?:\s|$)|에게)/, label: "그는/그가/그의" },
      { re: /(?<![가-힣])그녀(?=[은는가를의도]|에게|\s|$)/, label: "그녀" },
      { re: /(?<![가-힣])그들(?=[은는이을의도]|에게|\s|$)/, label: "그들" },
    ],
  },
  {
    id: "rhetorical-question",
    section: "5-8",
    title: "답하지 않는 질문",
    mode: "clustered",
    threshold: 3,
    skipQuotes: true,
    hint: "질문을 지우고 답을 쓴다",
    patterns: [{ re: /(까요|을까|일까|는가|던가|나요)\?/ }, { re: /(?<![가-힣])과연(?![가-힣])/ }],
  },
  {
    id: "fake-friendly",
    section: "5-11",
    title: "가짜 친근함",
    mode: "clustered",
    threshold: 3,
    skipQuotes: true,
    hint: "지운다",
    patterns: [{ re: /솔직히/ }, { re: /여러분/ }, { re: /누구나 한 ?번쯤/ }],
  },
];

// ─── 3장 쓰지 않는 것 ────────────────────────────────────

export interface TopicRule {
  id: string;
  section: string;
  title: string;
  /** first-hit = 금지(오류), warn = 사람이 확인(경고) */
  mode: "first-hit" | "warn";
  hint: string;
  patterns: PhrasePattern[];
}

/** 제목·부제·태그·키워드·본문(따옴표 안 포함) 전부를 본다. */
export const TOPIC_RULES: TopicRule[] = [
  {
    id: "topic-gambling",
    section: "3",
    title: "도박 권유",
    mode: "first-hit",
    hint: "배당·베팅 정보는 싣지 않는다",
    patterns: [
      { re: /배당률|배당 흐름|역배|정배/ },
      { re: /(?<![가-힣])(스포츠)?토토(?!로|리)|(?<![가-힣])프로토(?![가-힣])|사설 토토/ },
      { re: /(베팅|배팅) ?(사이트|방법|팁|전략|추천|픽)/ },
      { re: /어디에 걸어야|어디에 걸지|승부 ?예측 ?픽|오늘의 픽/ },
    ],
  },
  {
    id: "topic-gambling-mention",
    section: "3",
    title: "도박 관련 낱말",
    mode: "warn",
    hint: "징계·사건 보도인지, 권유로 읽히는지 사람이 확인한다",
    patterns: [{ re: /도박|베팅|카지노/ }],
  },
  {
    id: "topic-adult",
    section: "3",
    title: "성인물·성적 대상화",
    mode: "first-hit",
    hint: "사람을 성적으로 다루는 말은 쓰지 않는다",
    patterns: [
      { re: /야동|포르노|성인물|19금|꿀벅지|베이글녀|직캠|몸매 (품평|순위)|노출 (사진|의상)/ },
      { re: /(?<![가-힣])섹시|(?<![가-힣])에로(틱|영화|물)/ },
    ],
  },
  {
    id: "topic-adult-mention",
    section: "3",
    title: "외모 관련 낱말",
    mode: "warn",
    hint: "외모 품평으로 읽히는지 사람이 확인한다",
    patterns: [{ re: /몸매|비키니|미모|얼짱/ }],
  },
  {
    id: "topic-hate",
    section: "3",
    title: "비하 은어",
    mode: "first-hit",
    hint: "집단을 깎아내리는 말은 옮기지도 않는다",
    patterns: [
      { re: /김치녀|김치남|된장녀|한남충|(?<![가-힣])한남들|(?<![가-힣])한녀(?![가-힣])|틀딱|급식충|맘충|짱깨|짱개|쪽바리|조센징|흑형|똥남아|개독|냄저|페미나치|메갈/ },
      { re: /좌좀|수꼴|빨갱이|토착왜구|대깨|개딸/ },
    ],
  },
  {
    id: "topic-politics",
    section: "3",
    title: "정당·선거",
    mode: "warn",
    hint: "정당·정치인 평가 글은 쓰지 않는다. 꼭 다뤄야 하면 양쪽 주장을 같은 분량으로",
    patterns: [
      { re: /더불어민주당|국민의힘|조국혁신당|개혁신당|정의당|진보당|민주당|공화당/ },
      { re: /(?<![가-힣])(대선|총선|지방선거|탄핵)(?![가-힣])/ },
    ],
  },
  {
    id: "topic-invest",
    section: "3",
    title: "투자 권유",
    mode: "first-hit",
    hint: "공개된 숫자까지만 전한다",
    patterns: [
      { re: /지금 사야|매수 ?추천|매수하세요|추천 종목|풀매수|몰빵|물타기 하|떡상 예정|무조건 오른|사 두면 오른/ },
    ],
  },
  {
    id: "topic-invest-mention",
    section: "3",
    title: "투자 관련 낱말",
    mode: "warn",
    hint: "전망을 권유처럼 쓰지 않았는지 확인한다",
    patterns: [{ re: /목표주가|수익률 보장|코인 추천|급등주|유망주식/ }],
  },
  {
    id: "topic-medical",
    section: "3",
    title: "의료 조언",
    mode: "first-hit",
    hint: "약·보충제 용량과 치료법은 쓰지 않는다. 공식 지침을 전하는 데서 멈춘다",
    patterns: [{ re: /복용하세요|먹으면 낫|완치됩니다|완치할 수 있|치료됩니다|처방 없이|복용량은 하루/ }],
  },
  {
    id: "topic-medical-mention",
    section: "3",
    title: "용량 숫자",
    mode: "warn",
    hint: "공식 지침(기관 이름)을 그대로 옮긴 것인지 확인한다",
    patterns: [{ re: /하루\s*\d[\d,.]*\s*(mg|밀리그램|㎎|정|알|캡슐|IU)/i }],
  },
  {
    id: "topic-rumor",
    section: "3",
    title: "소문",
    mode: "warn",
    hint: "본인·소속 단체가 확인했는지, 아니면 '누가 어디서 보도했다'까지만 썼는지 확인한다",
    patterns: [{ re: /사망설|열애설|이적설|불화설|결별설|은퇴설/ }],
  },
];

// ─── 4장 근거 호스트 ─────────────────────────────────────

export interface HostRule {
  host: string;
  reason: string;
  /** 이 경로는 커뮤니티가 아니라 기사라서 허용 */
  allowPath?: RegExp;
}

/** 근거로 쓰면 실패: 커뮤니티·나무위키·블로그 */
export const BANNED_SOURCE_HOSTS: HostRule[] = [
  { host: "namu.wiki", reason: "나무위키" },
  { host: "namu.moe", reason: "나무위키" },
  { host: "fmkorea.com", reason: "커뮤니티" },
  { host: "dcinside.com", reason: "커뮤니티" },
  { host: "ruliweb.com", reason: "커뮤니티", allowPath: /\/news\// },
  { host: "inven.co.kr", reason: "커뮤니티", allowPath: /^\/webzine\/news/ },
  { host: "mlbpark.donga.com", reason: "커뮤니티" },
  { host: "bobaedream.co.kr", reason: "커뮤니티" },
  { host: "ppomppu.co.kr", reason: "커뮤니티" },
  { host: "clien.net", reason: "커뮤니티" },
  { host: "arca.live", reason: "커뮤니티" },
  { host: "dogdrip.net", reason: "커뮤니티" },
  { host: "theqoo.net", reason: "커뮤니티" },
  { host: "instiz.net", reason: "커뮤니티" },
  { host: "ilbe.com", reason: "커뮤니티" },
  { host: "pann.nate.com", reason: "커뮤니티" },
  { host: "todayhumor.co.kr", reason: "커뮤니티" },
  { host: "humoruniv.com", reason: "커뮤니티" },
  { host: "ygosu.com", reason: "커뮤니티" },
  { host: "etoland.co.kr", reason: "커뮤니티" },
  { host: "reddit.com", reason: "커뮤니티" },
  { host: "quora.com", reason: "커뮤니티" },
  { host: "kin.naver.com", reason: "커뮤니티(지식iN)" },
  { host: "cafe.naver.com", reason: "커뮤니티(카페)" },
  { host: "cafe.daum.net", reason: "커뮤니티(카페)" },
  { host: "blog.naver.com", reason: "블로그" },
  { host: "m.blog.naver.com", reason: "블로그" },
  { host: "post.naver.com", reason: "블로그(포스트)" },
  { host: "blog.daum.net", reason: "블로그" },
  { host: "tistory.com", reason: "블로그" },
  { host: "brunch.co.kr", reason: "블로그" },
  { host: "velog.io", reason: "블로그" },
  { host: "egloos.com", reason: "블로그" },
  { host: "blogspot.com", reason: "블로그" },
  { host: "wordpress.com", reason: "블로그" },
  { host: "medium.com", reason: "블로그" },
  { host: "substack.com", reason: "블로그" },
  { host: "tumblr.com", reason: "블로그" },
];

/** 근거로는 되지만 사람이 한 번 더 볼 곳(경고) */
export const CAUTION_SOURCE_HOSTS: HostRule[] = [
  { host: "wikipedia.org", reason: "2차 자료. 1차 자료(주최 단체·제조사·공시)로 바꾸길 권함" },
  { host: "youtube.com", reason: "공식 채널인지 확인" },
  { host: "youtu.be", reason: "공식 채널인지 확인" },
  { host: "x.com", reason: "본인·공식 계정인지 확인" },
  { host: "twitter.com", reason: "본인·공식 계정인지 확인" },
  { host: "instagram.com", reason: "본인·공식 계정인지 확인" },
  { host: "facebook.com", reason: "본인·공식 계정인지 확인" },
  { host: "threads.net", reason: "본인·공식 계정인지 확인" },
];

/** 등록 도메인을 셋째 칸까지 봐야 하는 둘째 단계 도메인 */
export const SECOND_LEVEL_SUFFIXES = new Set([
  "co.kr",
  "or.kr",
  "go.kr",
  "ne.kr",
  "re.kr",
  "ac.kr",
  "pe.kr",
  "co.uk",
  "org.uk",
  "ac.uk",
  "co.jp",
  "or.jp",
  "ne.jp",
  "com.au",
  "com.br",
  "com.cn",
  "com.tw",
]);
