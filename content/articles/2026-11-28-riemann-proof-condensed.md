---
title: "리만 가설 증명 코드, 1,553만 줄에서 7만 6천 줄로 압축"
deck: "앤트로픽 수학자가 클로드와 11월 20일 낸 증명을 동료가 닷새 만에 줄였습니다. 컴퓨터 검사는 통과했는데, 끝까지 읽은 수학자는 아직 없습니다."
slug: riemann-proof-condensed
category: 테크
tags:
  - 리만 가설
  - 앤트로픽
  - 클로드
  - 린(Lean)
  - 밀레니엄 문제
publishedAt: "2026-11-28T14:45:00+09:00"
kicker: "왜 난리인가"
image:
  url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/16/Informationsschild_%28Bernhard_Riemann%29.JPG/1920px-Informationsschild_%28Bernhard_Riemann%29.JPG"
  credit: "사진: Manecke / Wikimedia Commons"
  license: "CC BY-SA 3.0"
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Informationsschild_(Bernhard_Riemann).JPG"
  alt: "독일 괴팅겐의 건물 벽에 붙은 흰 대리석 표지판. BERNHARD RIEMANN MATHEMATIKER 1854 1857이라고 새겨져 있다"
  width: 1920
  height: 1497
sources:
  - title: "Remark (리만 가설 증명 발표문, 4쪽)"
    publisher: "Levent Alpöge"
    url: "https://alpo.ge/remark.pdf"
  - title: "Lean verification of the Riemann Hypothesis"
    publisher: "Lean FRO · Mathlib Initiative(린 커뮤니티 블로그)"
    url: "https://leanprover-community.github.io/blog/posts/riemann-hypothesis/"
  - title: "grh-lean: A Lean 4 proof of the Riemann Hypothesis and of the Generalized Riemann Hypothesis for Dirichlet L-functions"
    publisher: "GitHub(Luke Sernau)"
    url: "https://github.com/lsernau/grh-lean"
  - title: "Verification files for the shorter Lean proof of RH and of GRH for Dirichlet L-functions"
    publisher: "Andrew Sutherland(MIT)"
    url: "https://math.mit.edu/~drew/shortgrh/"
  - title: "The announced proof of the Riemann hypothesis: map, guide and record of checks"
    publisher: "riemann-rev(GitHub Pages)"
    url: "https://nasqret.github.io/riemann-rev/"
  - title: "Riemann hypothesis: Claude cuts AI proof by more than 99%"
    publisher: "heise online"
    url: "https://www.heise.de/en/news/Riemann-hypothesis-Claude-cuts-AI-proof-by-more-than-99-11539304.html"
  - title: "“167년 수학 난제 ‘리만가설’, AI가 풀었다”…앤트로픽, 가설 증명 주장"
    publisher: "헤럴드경제"
    url: "https://biz.heraldcorp.com/article/10944556"
  - title: "'Monumental': For 165 years, nobody could crack it. That may have just changed"
    publisher: "SBS News"
    url: "https://www.sbs.com.au/news/article/riemann-hypothesis-maths-problem-solved/j3peyk1hn"
  - title: "The Riemann Hypothesis"
    publisher: "Clay Mathematics Institute"
    url: "https://www.claymath.org/millennium/riemann-hypothesis/"
  - title: "Millennium Prize Problems"
    publisher: "Clay Mathematics Institute"
    url: "https://www.claymath.org/millennium-problems/"
  - title: "Rules for the Millennium Prize Problems"
    publisher: "Clay Mathematics Institute"
    url: "https://www.claymath.org/millennium-problems/rules/"
keywords:
  - 리만 가설
eventIds: []
---

11월 25일 앤트로픽 연구원 루크 서노(Luke Sernau)가 깃허브에 리만 가설 증명 코드 압축본을 올렸습니다. 닷새 전인 11월 20일 같은 회사 수학자 레벤트 알푀게(Levent Alpöge)가 AI 클로드와 함께 찾았다며 낸 증명을 줄인 판이죠. 원본은 1,737만 줄이었고, 주석과 빈 줄을 걷어 내고 코드만 세도 1,553만 줄이나 됐습니다. 이걸 코드 7만 6,149줄로 압축했습니다. 다만 지금 확인된 건 증명이 나왔고 컴퓨터 검사를 통과했다는 데까지입니다. 정작 처음부터 끝까지 읽은 수학자는 아직 없거든요.

## 167년 묵은 문제, 상금 100만 달러

리만 가설은 1859년 독일 수학자 베른하르트 리만이 소수의 분포를 두고 던진 추측입니다. 클레이 수학연구소 설명대로 소수 정리가 소수의 평균 분포를 정하고, 리만 가설은 실제 분포가 그 평균에서 얼마나 벗어나는지 말해 줍니다. 제타 함수의 '자명하지 않은' 영점이 모두 실수부가 1/2인 복소수라는 주장이거든요.

클레이 수학연구소는 2000년 5월 24일 파리 콜레주 드 프랑스에서 밀레니엄 문제 7개를 발표했습니다. 문제마다 상금이 100만 달러죠. 연구소 누리집의 풀린 문제 칸에는 페렐만이 증명한 푸앵카레 추측 하나뿐입니다.

## 11월 20일, 네 쪽 글과 1,737만 줄

알푀게는 자기 누리집에 네 쪽짜리 글을 띄웠습니다. 첫 쪽에 "클로드와 함께 리만 가설의 증명을 발견했다고 믿는다"고 썼죠. 같은 방법으로 디리클레 L 함수에 대한 일반화된 리만 가설까지 풀린다고 밝혔습니다.

알푀게가 꺼내 든 건 사람이 읽는 논문이 아니었습니다. 린(Lean) 코드였죠. 린은 수학 증명을 프로그램처럼 적어 컴퓨터가 한 단계씩 맞는지 검사하게 하는 언어입니다. 알푀게는 같은 글에서 이 수학 주변을 다 익히기 전에 완성된 논증부터 내놓게 됐다고 털어놨습니다. 읽기 어려운 거대한 문서를 올리는 대신 린 코드만 공개하기로 했다는 겁니다. 논증을 제대로 글로 써서 설명하겠다는 계획도 적었습니다. 글 뒤에 붙인 진행 시간표 첫 줄은 10월 6일인데요. 발표일인 11월 20일까지 45일입니다.

이튿날인 11월 21일, 린을 만드는 린 FRO와 수학 라이브러리 매스립(Mathlib) 쪽이 공동 성명을 냈습니다. "알푀게의 리만 가설 증명이 옳다고 전적으로 확신한다"는 내용이었죠. 코드가 증명한 명제가 매스립에 미리 적어 둔 리만 가설 정식 진술과 같은지 도구 두 개로 대조하고, 린 공식 커널 등 여러 검사기에 돌렸다고 합니다. 수십 명이 각자 코드를 컴파일해 똑같은 결과 파일을 얻었다는 보고도 담겼습니다. 이 증명의 새 아이디어를 설명할 수학계의 활동을 기대한다는 문장도 있습니다.

반응도 컸습니다. 헤럴드경제가 전한 AFP 보도에서 수학자 브라이언 콘리는 "수학사에서 일어난 일 가운데 가장 큰 사건"이라고 평했습니다. 다만 콘리는 아직 논문은 보지 못했고 알푀게의 누리집 글만 읽었다고 덧붙였죠. 클레이 수학연구소 마틴 브리드슨 소장은 "역사적 의미가 있는 발표"라면서도, 이 결과를 제대로 이해하려면 할 일이 많다고 말했습니다(SBS).

## 11월 25일 압축본, 코드 204분의 1

알푀게도 첫 글에서 논증이 크게 간단해질 거라 내다봤습니다. heise에 따르면 알푀게는 X에서도 린 코드에 불필요한 내용이 많이 들어 있었다고 인정했거든요. 그렇게 닷새 만에 나온 게 서노의 압축본입니다. 서노는 깃허브 저장소 grh-lean에 두 판을 올렸습니다. 읽기 쉬운 판과 압축판인데, 둘 다 원본과 같은 다섯 정리를 증명합니다. 저장소 설명에는 앤트로픽 동료들, 그리고 클로드와 함께 만들었다고 적혀 있습니다.

MIT 수학자 앤드루 서덜랜드 검증 페이지(11월 28일 확인)의 숫자를 보면 차이가 확 들어옵니다.

| 판 | 파일 | 전체 줄 | 코드 줄 |
|---|---|---|---|
| 원본(11월 20일) | 175,187개 | 17,374,215줄 | 15,531,759줄 |
| 읽기 쉬운 판 | 803개 | 477,124줄 | 299,902줄 |
| 압축판 | 794개 | 112,827줄 | 76,149줄 |

코드 줄만 놓고 보면 압축판이 원본의 약 204분의 1입니다. 매체마다 7만 6천 줄, 11만 3천 줄로 다른 건 주석과 빈 줄을 세느냐의 차이죠(heise). 서덜랜드는 검사를 클로드 코드로 돌렸습니다. 두 판 다 오류 없이 컴파일됐고, 다섯 정리가 린의 기본 공리 세 개에만 기댄다고 적어 뒀습니다. 압축판은 모듈 794개가 커널 재검사를 다 통과했고, 비교 판정 도구도 두 대의 컴퓨터에서 통과 판정을 냈습니다. 반면 읽기 쉬운 판의 비교 판정은 큰 컴퓨터에서만 끝났습니다. 독립 검사기 lean4lean이 메모리만 332GB를 먹어서, 작은 컴퓨터로는 마치지 못했거든요. 저장소 안내로는 압축판을 직접 빌드하는 데 12코어, 메모리 24GB 컴퓨터로 한두 시간이 걸립니다.

## 기계 검사 끝, 사람 몫으로 남은 일

서노도 저장소에 못 박아 뒀습니다. 기계 검사만 통과했고 끝까지 읽은 수학자도, 딸린 논문도 없다고 적어 놨거든요. 서덜랜드도 자기 검사는 수학자가 논증을 읽고 이해했는지는 아무것도 말해 주지 않는다고 밝혔습니다. 컴퓨터는 명제와 증명이 맞는지 따져 줬을 뿐입니다. 증명에 어떤 새 아이디어가 들었는지 설명하는 일은 사람 몫으로 남은 상태죠.

먼저 풀어 보려는 시도는 나왔습니다. heise에 따르면 수학자 바르토시 나스크렝츠키(Bartosz Naskręcki)가 AI로 압축판을 사람이 읽는 글로 풀어 쓴 초안을 내놨는데요. 11월 26일 이 초안을 올린 안내 페이지에는 AI 에이전트가 읽고 프로그램이 검사했을 뿐, 사람의 심사는 거치지 않았다고 적혀 있습니다. 이 초안이 리만 가설의 증명을 보증하지 않는다는 문장도 붙어 있죠.

상금까지는 절차가 더 깁니다. 클레이 수학연구소 규칙상 해법은 인정된 학술 매체에 실려야 합니다. 실린 뒤 2년 이상 지나야 하고, 세계 수학계가 받아들여야 하죠. 지금 나온 건 린 코드와 네 쪽 글뿐이라 학술지 게재라는 첫 문턱부터 못 넘었습니다. 규칙대로라면 올해 안에 논문이 실린다 해도 2년이 지나는 2028년 말까지는 상금 대상이 될 수 없습니다. 11월 28일 확인한 클레이 수학연구소 누리집에서 리만 가설은 나비에-스토크스 방정식과 함께 '진행 중(Active)' 칸에 있습니다. 미해결 문제 넷과도, 풀린 문제 칸과도 따로 떼어 둔 자리인데요. 리만 가설 쪽 설명에는 이번 발표에 대한 언급이 없습니다.
