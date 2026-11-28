import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "개인정보 처리방침",
  description: `${BRAND.name}(${BRAND.domain}) 웹사이트와 앱이 어떤 정보를 다루는지, 광고와 쿠키, 앱 알림이 어떻게 쓰이는지 적었습니다.`,
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <main id="main" className="page doc">
      <header className="page-head">
        <p className="eyebrow">PRIVACY</p>
        <h1>개인정보 처리방침</h1>
        <p className="page-deck">시행일 2026년 11월 26일 · 앱 항목 추가 2026년 11월 28일</p>
      </header>

      <h2>1. 우리가 받는 정보</h2>
      <p>
        {BRAND.name}는 회원 가입이 없고, 이름·이메일·전화번호 같은 개인정보를 받지 않습니다. 일정 페이지의
        ‘관심사’와 ‘기대 걸기’ 목록은 방문자의 브라우저(localStorage)에만 저장되고 서버로 보내지 않습니다.
        브라우저 설정에서 사이트 데이터를 지우면 함께 지워집니다. 휴대폰 앱에서 다루는 정보는 아래 5항에 적었습니다.
      </p>

      <h2>2. 접속 기록</h2>
      <p>
        사이트를 올려 둔 호스팅 회사(Vercel)의 서버에 접속 시각, IP 주소, 브라우저 종류 같은 접속 기록이
        남습니다. 이 기록은 장애 대응과 부정 접속 차단에 쓰입니다.
      </p>

      <h2>3. 광고와 쿠키</h2>
      <p>
        이 사이트는 Google 애드센스 광고를 싣습니다. Google을 비롯한 광고 사업자는 쿠키를 써서 방문자가 이
        사이트나 다른 사이트를 방문한 기록을 바탕으로 광고를 보여 줍니다.
      </p>
      <ul>
        <li>
          Google의 광고 쿠키 사용은{" "}
          <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">
            Google 광고 정책
          </a>
          에 따릅니다.
        </li>
        <li>
          맞춤 광고는{" "}
          <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">
            Google 광고 설정
          </a>
          에서 끌 수 있습니다.
        </li>
        <li>브라우저 설정에서 쿠키 저장을 막을 수도 있습니다. 그래도 글과 순위는 그대로 볼 수 있습니다.</li>
      </ul>

      <h2>4. 바깥 사이트 링크</h2>
      <p>
        키워드 순위의 대표 글, 글 아래 근거 자료, 일정의 공식 페이지는 바깥 사이트로 연결됩니다. 그 사이트에서
        일어나는 정보 처리는 해당 사이트의 방침을 따릅니다.
      </p>

      <h2>5. 휴대폰 앱</h2>
      <p>{BRAND.name} 앱(iOS·안드로이드)은 이 사이트의 화면을 그대로 보여 주고, 알림 기능을 더한 앱입니다.</p>
      <ul>
        <li>회원 가입과 로그인이 없습니다. 이름·이메일·전화번호·위치·연락처·사진을 받지 않습니다.</li>
        <li>
          저장한 일정, 관심 종목, 알림 설정은 휴대폰 안의 앱 저장소에만 남고 서버로 보내지 않습니다. 앱을 지우면 함께
          지워집니다.
        </li>
        <li>
          알림은 휴대폰 안에서 예약하는 알림(로컬 알림)입니다. 알림을 보내려고 기기 식별 번호(푸시 토큰)를 받거나 서버에
          보내지 않습니다. 알림 허용은 휴대폰 설정에서 언제든 끌 수 있습니다.
        </li>
        <li>
          지금 앱 버전에는 광고가 없습니다. 광고 식별자(IDFA·광고 ID)를 쓰지 않고, 다른 회사의 앱이나 웹사이트에 걸쳐
          이용자를 추적하지 않습니다. 앱에 광고를 넣게 되면 그 전에 이 항목을 고쳐 알립니다.
        </li>
        <li>앱이 화면과 일정 정보를 받으려고 {BRAND.domain} 서버에 접속할 때 2항의 접속 기록이 남습니다.</li>
        <li>바깥 사이트 링크는 앱 안 브라우저 창으로 열리고, 그 사이트의 방침을 따릅니다.</li>
      </ul>

      <h2 id="contact">6. 문의</h2>
      {BRAND.privacyEmail ? (
        <p>
          개인정보와 관련한 문의, 앱 이용 문의는 <a href={`mailto:${BRAND.privacyEmail}`}>{BRAND.privacyEmail}</a>로 보내
          주세요.
        </p>
      ) : (
        <p>문의 주소를 준비하고 있습니다. 주소가 정해지면 이 자리에 적겠습니다.</p>
      )}

      <h2>7. 방침이 바뀌면</h2>
      <p>내용이 바뀌면 이 페이지에 새 시행일과 함께 올립니다.</p>
    </main>
  );
}
