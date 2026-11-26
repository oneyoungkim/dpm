/**
 * 제목 → 낱말 토막.
 * 형태소 분석기 없이: 머리표 떼기 → 문장부호 정리 → 글자 종류 경계로 자르기 → 조사·어미 떼기 → 걸러내기.
 */

import {
  ALIASES,
  BOARD_WORDS,
  CATEGORY_SEEDS,
  EXTRA_ENTITIES,
  LABEL_WORDS,
  SENSITIVE_KEYWORDS,
  STOPWORDS,
  foldText,
  normalizeKey,
} from "./dictionaries";

// ---------------------------------------------------------------------------
// 사전 색인
// ---------------------------------------------------------------------------

/** 별칭(정규화) → 정식 이름 */
const aliasToCanonical = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(ALIASES)) {
  aliasToCanonical.set(normalizeKey(canonical), canonical);
  for (const alias of aliases) aliasToCanonical.set(normalizeKey(alias), canonical);
}

/** 사전에 있는 말(조사를 떼면 안 되는 말, 한 글자여도 살리는 말) */
export const KNOWN = new Set<string>([
  ...aliasToCanonical.keys(),
  ...Object.values(CATEGORY_SEEDS).flat().map(normalizeKey),
  ...SENSITIVE_KEYWORDS.map(normalizeKey),
  ...EXTRA_ENTITIES.map(normalizeKey),
]);

const STOP = new Set([...STOPWORDS, ...BOARD_WORDS, ...LABEL_WORDS].map(normalizeKey));
const LABELS = new Set(LABEL_WORDS.map(normalizeKey));

/** 한글과 영문이 붙은 사전 낱말(LG트윈스, 챗GPT …). 글자 경계로 자르기 전에 먼저 찾는다. */
const MIXED_TERMS = [...KNOWN].filter((k) => /[a-z0-9]/.test(k) && /[가-힣]/.test(k)).sort((a, b) => b.length - a.length);

export function canonicalOf(text: string): string | null {
  return aliasToCanonical.get(normalizeKey(text)) ?? null;
}

export function isStopword(text: string): boolean {
  return STOP.has(normalizeKey(text));
}

// ---------------------------------------------------------------------------
// 제목 정리
// ---------------------------------------------------------------------------

export interface CleanTitle {
  /** 키워드 뽑기에 쓰는 본문 */
  text: string;
  /** 떼어 낸 머리표(분류 힌트로만 쓴다) */
  labels: string[];
}

const EXT_RE = /\.{0,3}\s*\b(jpe?g|gif|png|webp|mp4|gfy|avi|webm|mov)\b/gi;

export function cleanTitle(raw: string): CleanTitle {
  let text = foldText(raw).replace(/https?:\/\/\S+/g, " ").replace(EXT_RE, " ");
  const labels: string[] = [];

  // 앞머리 [오피셜] (속보) 【단독】
  for (let guard = 0; guard < 4; guard++) {
    const m = text.match(/^\s*[[(【<]([^\])】>]{1,15})[\])】>]\s*/);
    if (!m) break;
    labels.push(m[1].trim());
    const parts = m[1].split(/[,/·\s]+/).filter(Boolean);
    const allLabels = parts.every((p) => LABELS.has(normalizeKey(p)) || /^\d+$/.test(p));
    text = (allLabels ? "" : `${m[1]} `) + text.slice(m[0].length);
  }
  // 앞머리 "주식)" "ㅇㅎ)" "후방,눈갱주의))" "JTBC)"
  const prefix = text.match(/^\s*([^\s)(]{1,12})\){1,2}\s*/);
  if (prefix) {
    labels.push(prefix[1]);
    const parts = prefix[1].split(/[,/·]+/).filter(Boolean);
    const allLabels = parts.every((p) => LABELS.has(normalizeKey(p)) || /^[ㄱ-ㅎ]+$/.test(p));
    text = (allLabels ? "" : `${prefix[1]} `) + text.slice(prefix[0].length);
  }
  // 중간에 낀 [스압] (펌) 같은 것도 지운다
  text = text.replace(/[[(【]([^\])】]{1,8})[\])】]/g, (all, inner: string) =>
    LABELS.has(normalizeKey(inner)) ? " " : ` ${inner} `,
  );

  text = text
    .replace(/[ㄱ-ㅎㅏ-ㅣ]+/g, " ") // ㅋㅋ ㄷㄷ ㅠㅠ
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/[^0-9A-Za-z가-힣+&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { text, labels };
}

// ---------------------------------------------------------------------------
// 조사·어미
// ---------------------------------------------------------------------------

/** 여러 글자 조사: 떼고 남은 말이 2글자 이상이면 뗀다 */
const MULTI_JOSA = [
  "에게서", "으로서", "으로써", "으로는", "으로도", "에서는", "에서도", "에서의", "에게는", "에게도",
  "한테서", "한테는", "까지는", "까지도", "부터는", "이라는", "이라고", "이라서", "이라면", "이었다",
  "이었던", "이란", "이랑", "이라", "이나", "이며", "이고", "이든", "이지만", "였다", "였던", "라는",
  "라고", "라서", "라면", "에서", "에게", "한테", "께서", "으로", "까지", "부터", "처럼", "보다", "마저",
  "조차", "밖에", "만큼", "대로", "하고", "과의", "와의", "에는", "에도", "에의", "로는", "로도", "로서",
  "로써", "만의", "들이", "들은", "들을", "들의", "들도", "들과", "들한테", "들에게", "님이", "님은",
  "님의", "님도", "씨가", "씨는", "씨의", "인데", "인가", "인지", "이냐", "이야", "이다", "이네",
].sort((a, b) => b.length - a.length);

/** 받침 뒤에 붙는 은/는/을/를/들: 남은 말이 2글자 이상이면 뗀다 */
const SAFE_JOSA = ["를", "는", "은", "을", "들", "님"];

/** 명사 끝 글자와 헷갈리는 조사(고양이, 닌텐도, 레트로): 남은 말이 3글자 이상이거나 따로 나온 말일 때만 */
const RISKY_JOSA = ["이", "가", "의", "도", "로", "만", "와", "과", "랑", "에", "야"];
/** 애매한 조사 가운데 두 글자 남아도 떼는 것(회의·결과처럼 한 글자 남는 것만 명사다) */
const LOOSE_JOSA = ["의", "에", "와", "과", "랑"];

/** 술어·어미로 끝나는 토막: 키워드가 아니므로 버린다 */
const PREDICATE_ENDINGS = [
  "했다", "한다", "하다", "된다", "됐다", "되다", "있다", "없다", "였다", "이다", "었다", "았다", "겠다",
  "는다", "합니다", "입니다", "습니다", "니다", "세요", "해요", "어요", "아요", "에요", "예요", "네요",
  "군요", "는데", "은데", "던데", "는지", "은지", "하는", "하던", "하게", "하고", "하면", "해서", "해도",
  "했던", "했는", "했고", "했음", "하냐", "하네", "했네", "했냐", "했나", "되는", "되던", "되게", "되고",
  "되면", "돼서", "됐던", "됐는", "됐음", "있는", "있던", "있고", "있음", "있게", "없는", "없던", "없고",
  "없음", "없이", "같은", "같이", "같다", "않은", "않는", "않고", "많은", "좋은", "좋아", "싫은", "나쁜",
  "싶은", "싶다", "보는", "보고", "봤다", "봤던", "보니", "보면", "가는", "가고", "간다", "갔다", "오는",
  "오고", "온다", "왔다", "나온", "나오는", "나왔다", "만든", "만드는", "받은", "받는", "주는", "준다",
  "먹는", "먹은", "먹고", "사는", "치는", "뜨는", "알고", "아는", "모르는", "모르고", "같네", "겠네",
  "더라", "더니", "려고", "으려", "라도", "지만", "면서", "으면", "으니", "니까", "하지", "되지", "않지",
  "였음", "었음", "았음", "하자", "해라", "해줘", "주세요", "드림", "할까", "될까", "을까", "는가",
  "냐", "죠", "나요", "인데", "보자", "하자", "가자", "인가", "는거", "은거", "한거", "던거", "하는거", "인거", "길래", "다며", "다고", "다는",
  "자는", "려는", "러", "구나", "군", "잖아", "거든", "는듯", "한듯", "인듯", "할듯", "될듯", "듯",
];

/** 3글자 이상일 때만 술어로 보는 끝 글자 */
const LONG_PREDICATE_TAILS = ["다", "음", "함", "됨", "한", "던", "게", "요", "네", "냐", "니", "지", "고"];

/** 자주 나오는 관형형·연결형 낱말(끝 글자만으로는 명사와 못 가르는 것들) */
const PREDICATE_WORDS = new Set([
  "못하", "대하", "위하", "인하", "통하", "향하", "빡친", "빡침", "떠난", "화난", "망한", "변한", "슬픈", "웃긴", "숙이", "걸린", "생긴", "터진", "빠진", "당한", "팔린", "잡힌", "버린", "만든", "나온", "들킨", "놀란", "이긴",
  "죽은", "미친", "남긴", "붙은", "보인", "오른", "내린", "떨어진", "늘어난", "줄어든", "받은", "들은",
  "먹은", "찍힌", "뜬", "본", "쓴", "간", "온", "산", "탄", "된", "난", "진", "친", "준", "큰", "작은",
  "새로운", "엄청난", "대단한", "이상한", "특별한", "완벽한", "유명한", "다양한", "간단한", "불쌍한",
  "올리면", "버티면", "하다면", "있다면", "없다면", "보면", "치면", "가면서", "라면서", "이라며",
]);
const PREDICATE_TAIL_PAIRS = ["리면", "치면", "다면", "으면", "하면", "되면", "보면", "지면", "기면", "르면", "히면", "려면"];

/**
 * 조사·어미를 뗀다. corpusBare 는 이번 집계 제목에 따로 나온 낱말들(normalizeKey 기준, 횟수).
 * 애매한 한 글자 조사(이·가·로…)는 떼고 남은 말이 따로 나왔거나 사전에 있을 때, 아니면
 * 남은 말이 3글자 이상이고 조사 붙은 모양이 여러 제목에 되풀이되지 않을 때만 뗀다(마운자로 ×3 → 그대로).
 */
export function stripJosa(token: string, corpusBare?: Map<string, number>): string {
  let word = token;
  for (let pass = 0; pass < 2; pass++) {
    const key = normalizeKey(word);
    if (KNOWN.has(key)) return word;
    let next: string | null = null;
    for (const josa of MULTI_JOSA) {
      if (word.endsWith(josa) && word.length - josa.length >= 2) {
        next = word.slice(0, -josa.length);
        break;
      }
      if (word.endsWith(josa) && word.length - josa.length === 1 && KNOWN.has(normalizeKey(word.slice(0, -josa.length)))) {
        next = word.slice(0, -josa.length);
        break;
      }
    }
    if (!next) {
      const last = word.slice(-1);
      const stem = word.slice(0, -1);
      const stemKey = normalizeKey(stem);
      const stemKnown = KNOWN.has(stemKey) || (corpusBare?.has(stemKey) ?? false);
      // 조사 붙은 모양 그대로 여러 번 나왔으면(마운자로, 네이버페이, 여자아이) 그게 원래 낱말일 가능성이 크다
      const wordRepeats = (corpusBare?.get(key) ?? 0) >= 2;
      if (SAFE_JOSA.includes(last) && (stem.length >= 2 || stemKnown)) next = stem;
      else if (LOOSE_JOSA.includes(last) && stem.length >= 2 && /[가-힣]$/.test(stem)) next = stem;
      else if (RISKY_JOSA.includes(last) && /[가-힣]$/.test(stem) && (stemKnown || (stem.length >= 3 && !wordRepeats)))
        next = stem;
      else if (RISKY_JOSA.includes(last) && /[A-Za-z0-9]$/.test(stem)) next = stem; // GTA6가, T1의
    }
    if (!next || next === word) break;
    word = next;
  }
  return word;
}

/** 받침이 ㅆ 인 글자(했·떴·왔·있·겠)가 들어 있으면 거의 늘 용언이다 */
function hasSsangSiotFinal(word: string): boolean {
  for (const ch of word) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code < 11172 && code % 28 === 20) return true;
  }
  return false;
}

function looksLikePredicate(word: string): boolean {
  const key = normalizeKey(word);
  if (KNOWN.has(key)) return false;
  if (hasSsangSiotFinal(word)) return true;
  if (PREDICATE_WORDS.has(word)) return true;
  if (word.length >= 3 && PREDICATE_TAIL_PAIRS.some((e) => word.endsWith(e))) return true;
  if (PREDICATE_ENDINGS.some((e) => word.endsWith(e) && word.length > e.length - 1)) return true;
  if (word.length >= 3 && LONG_PREDICATE_TAILS.includes(word.slice(-1))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 토막 내기
// ---------------------------------------------------------------------------

export interface Token {
  /** 정규화 키(소문자·공백 없음). 별칭이면 정식 이름의 키 */
  key: string;
  /** 화면에 쓸 모양(정식 이름 또는 제목에 나온 모양) */
  display: string;
  /** 제목 안 위치(두 낱말 후보를 만들 때 붙어 있었는지 본다) */
  pos: number;
  /** 사전에 있는 이름인가 */
  known: boolean;
}

/** 공백으로 나눈 덩어리를 글자 종류 경계에서 한 번 더 자른다(사전의 섞인 말은 지킨다). */
function splitScripts(chunk: string): string[] {
  const out: string[] = [];
  let rest = chunk;
  while (rest) {
    const lower = normalizeKey(rest);
    const mixed = MIXED_TERMS.find((term) => lower.startsWith(term));
    if (mixed) {
      // 정규화로 길이가 바뀌지 않는 범위(영문·숫자·한글)라 글자 수로 자를 수 있다
      out.push(rest.slice(0, mixed.length));
      rest = rest.slice(mixed.length);
      continue;
    }
    // 영문/숫자 덩어리 다음 한글, 숫자 다음 한글, 한글 다음 영문에서 자른다(한글+숫자는 붙여 둔다: 스위치2, 디아4)
    const m = rest.match(/^([A-Za-z][A-Za-z0-9+&]*|[0-9][0-9A-Za-z]*|[가-힣]+[0-9]*)/);
    if (!m) {
      rest = rest.slice(1);
      continue;
    }
    out.push(m[1]);
    rest = rest.slice(m[1].length);
  }
  return out;
}

/** 이번 집계 전체 제목에서 따로(조사 없이) 나온 낱말 모음. 애매한 조사를 뗄지 정할 때 쓴다. */
export function bareWordSet(titles: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const title of titles) {
    for (const chunk of cleanTitle(title).text.split(" ")) {
      for (const piece of splitScripts(chunk)) {
        const key = normalizeKey(piece);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return counts;
}

const ALL_JOSA = [...MULTI_JOSA, ...SAFE_JOSA, ...RISKY_JOSA].sort((a, b) => b.length - a.length);

/** 토막 전체가 조사만으로 이뤄졌나("한테까지", "에서는") */
function isAllJosa(piece: string): boolean {
  let rest = piece;
  for (let guard = 0; rest && guard < 6; guard++) {
    const hit = ALL_JOSA.find((j) => rest.startsWith(j));
    if (!hit) return false;
    rest = rest.slice(hit.length);
  }
  return rest === "";
}

export function tokenize(title: string, corpusBare?: Map<string, number>): Token[] {
  const { text } = cleanTitle(title);
  const tokens: Token[] = [];
  let pos = 0;
  for (const chunk of text.split(" ")) {
    if (!chunk) continue;
    for (const piece of splitScripts(chunk)) {
      const at = pos++;
      // 숫자로 시작하는 토막(2026년, 151cm, 4만)은 버린다
      if (/^[0-9]/.test(piece)) continue;
      if (/^[가-힣]+$/.test(piece) && isAllJosa(piece)) continue;
      let word = /[가-힣]$/.test(piece) ? stripJosa(piece, corpusBare) : piece;
      if (/[가-힣]/.test(word) && looksLikePredicate(word)) continue;
      const canonical = canonicalOf(word);
      const key = normalizeKey(canonical ?? word);
      if (!key || STOP.has(key) || STOP.has(normalizeKey(word))) continue;
      // "직장인이"처럼 조사를 못 뗀 모양도 불용어면 버린다
      if (/[가-힣]$/.test(word) && [...RISKY_JOSA, ...SAFE_JOSA].includes(word.slice(-1)) && STOP.has(normalizeKey(word.slice(0, -1))))
        continue;
      const known = KNOWN.has(key) || KNOWN.has(normalizeKey(word));
      // 한 글자 한글, 두 글자 미만 영문은 사전에 있을 때만
      if (!known) {
        if (/^[가-힣]$/.test(word)) continue;
        if (/^[A-Za-z0-9+&]+$/.test(word) && word.length < 2) continue;
        if (/^[A-Za-z]+$/.test(word) && word.length < 3 && word !== word.toUpperCase()) continue;
      }
      if (canonical) word = canonical;
      tokens.push({ key, display: word, pos: at, known });
    }
  }
  return tokens;
}
