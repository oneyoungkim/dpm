/** 순위 변화. 우리 주식 화면처럼 오르면 빨강, 내리면 파랑. */
export function RankDelta({ delta }: { delta: number | null }) {
  if (delta === null)
    return (
      <span className="rank-delta rank-delta-new" aria-label="새로 진입">
        NEW
      </span>
    );
  if (delta > 0)
    return (
      <span className="rank-delta rank-delta-up" aria-label={`${delta}계단 상승`}>
        ▲{delta}
      </span>
    );
  if (delta < 0)
    return (
      <span className="rank-delta rank-delta-down" aria-label={`${-delta}계단 하락`}>
        ▼{-delta}
      </span>
    );
  return (
    <span className="rank-delta rank-delta-flat" aria-label="변동 없음">
      –
    </span>
  );
}
