"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InterestCategory, SportEvent } from "@/lib/types";
import { INTEREST_CATEGORIES } from "@/lib/types";
import { diffDays } from "@/lib/kst";
import { DEFAULT_INTERESTS, INTEREST_STYLE, interestCategoryOf } from "@/lib/interests";
import { EventCard } from "./EventCard";
import { InterestPicker } from "./InterestPicker";

const HIGHLIGHT_MIN_HYPE = 70;
const SAVED_STORAGE_KEY = "matchday.saved.v1";
const LEGACY_ALARM_KEY = "matchday.alarms.v1";
const INTEREST_STORAGE_KEY = "matchday.interests.v1";

type FeedView = "curated" | "mine" | "saved";
type BucketKey = "today" | "tomorrow" | "week" | "later";

const BUCKETS: Array<{ key: BucketKey; index: string; label: string; description: string; limit: number }> = [
  { key: "today", index: "01", label: "오늘", description: "지금 터지는 것", limit: 6 },
  { key: "tomorrow", index: "02", label: "내일", description: "다음 신호", limit: 6 },
  { key: "week", index: "03", label: "이번 주", description: "7일 안의 메인 이벤트", limit: 10 },
  { key: "later", index: "04", label: "그 이후", description: "레이더에 잡힌 다음 순간", limit: 12 },
];

function bucketFor(event: SportEvent, today: string): BucketKey {
  const days = diffDays(today, event.dateKey);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return "week";
  return "later";
}

function useSavedEvents() {
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const current = localStorage.getItem(SAVED_STORAGE_KEY);
      const legacy = localStorage.getItem(LEGACY_ALARM_KEY);
      const ids = current ? (JSON.parse(current) as string[]) : legacy ? (JSON.parse(legacy) as string[]) : [];
      setSaved(new Set(ids));
    } catch {
      // 저장소가 막혀 있어도 탐색 기능은 정상적으로 동작한다.
    }
  }, []);

  const toggleSaved = (id: string) => {
    setSaved((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // 저장 실패 시 현재 탭에서는 상태를 유지한다.
      }
      return next;
    });
  };

  return { saved, toggleSaved };
}

function useInterests() {
  const [interests, setInterests] = useState<Set<InterestCategory>>(new Set(DEFAULT_INTERESTS));
  const [configured, setConfigured] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(INTEREST_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        const valid = parsed.filter((value): value is InterestCategory =>
          INTEREST_CATEGORIES.includes(value as InterestCategory),
        );
        if (valid.length > 0) {
          setInterests(new Set(valid));
          setConfigured(true);
        }
      }
    } catch {
      // 기본 추천 관심사로 계속 진행한다.
    } finally {
      setReady(true);
    }
  }, []);

  const saveInterests = (next: Set<InterestCategory>) => {
    setInterests(new Set(next));
    setConfigured(true);
    try {
      localStorage.setItem(INTEREST_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // 현재 탭에서는 선택을 유지한다.
    }
  };

  return { interests, configured, ready, saveInterests };
}

export function ScheduleBrowser({
  events,
  today,
  activeCategories,
  featuredId,
  curatedCount,
  liveCount,
}: {
  events: SportEvent[];
  today: string;
  activeCategories: InterestCategory[];
  featuredId?: string;
  curatedCount: number;
  liveCount: number;
}) {
  const [view, setView] = useState<FeedView>("curated");
  const [category, setCategory] = useState<InterestCategory | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<BucketKey>>(new Set());
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftInterests, setDraftInterests] = useState<Set<InterestCategory>>(new Set(DEFAULT_INTERESTS));
  const { saved, toggleSaved } = useSavedEvents();
  const { interests, configured, ready, saveInterests } = useInterests();

  useEffect(() => {
    if (ready && configured) {
      setView("mine");
    }
  }, [configured, ready]);

  const openInterestPicker = useCallback(() => {
    setDraftInterests(new Set(interests));
    setPickerOpen(true);
  }, [interests]);

  const closeInterestPicker = useCallback(() => setPickerOpen(false), []);

  const toggleDraftInterest = (nextCategory: InterestCategory) => {
    setDraftInterests((previous) => {
      const next = new Set(previous);
      if (next.has(nextCategory)) next.delete(nextCategory);
      else next.add(nextCategory);
      return next;
    });
  };

  const applyInterests = () => {
    if (draftInterests.size === 0) return;
    saveInterests(draftInterests);
    setCategory(null);
    setView("mine");
    setPickerOpen(false);
  };

  const chooseView = (next: FeedView) => {
    setView(next);
    setCategory(null);
    if (next === "mine" && !configured) openInterestPicker();
  };

  const filtered = useMemo(() => {
    let result = events.filter((event) => event.status !== "취소" && event.status !== "종료");
    if (view === "saved") result = result.filter((event) => saved.has(event.id));
    if (view === "mine") result = result.filter((event) => interests.has(interestCategoryOf(event)));
    if (category) result = result.filter((event) => interestCategoryOf(event) === category);
    if (!showAll) result = result.filter((event) => event.hype >= HIGHLIGHT_MIN_HYPE);
    return result.sort(
      (a, b) => a.dateKey.localeCompare(b.dateKey) || b.hype - a.hype || a.startsAt.localeCompare(b.startsAt),
    );
  }, [category, events, interests, saved, showAll, view]);

  const featured = useMemo(() => {
    if (view === "curated" && category === null && featuredId) {
      const initial = filtered.find((event) => event.id === featuredId);
      if (initial) return initial;
    }
    return [...filtered].sort((a, b) => b.hype - a.hype || a.startsAt.localeCompare(b.startsAt))[0];
  }, [category, featuredId, filtered, view]);

  const grouped = useMemo(() => {
    const map = new Map<BucketKey, SportEvent[]>(BUCKETS.map((bucket) => [bucket.key, []]));
    for (const event of filtered) {
      if (event.id === featured?.id) continue;
      map.get(bucketFor(event, today))?.push(event);
    }
    return map;
  }, [featured?.id, filtered, today]);

  const visibleCategories = useMemo(() => {
    if (view === "mine") return activeCategories.filter((item) => interests.has(item));
    if (view === "saved") {
      const savedCategories = new Set(
        events.filter((event) => saved.has(event.id)).map(interestCategoryOf),
      );
      return activeCategories.filter((item) => savedCategories.has(item));
    }
    return activeCategories;
  }, [activeCategories, events, interests, saved, view]);

  const handleShare = async (event: SportEvent) => {
    const days = diffDays(today, event.dateKey);
    const dday = event.status === "진행중" ? "LIVE" : days === 0 ? "TODAY" : `D-${days}`;
    const text = `${event.title} — ${dday}\n${event.series ?? event.league} · DPMBROS`;
    try {
      if (navigator.share) await navigator.share({ title: event.title, text, url: window.location.href });
      else await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
      setSharedId(event.id);
      window.setTimeout(() => setSharedId(null), 1800);
    } catch {
      // 사용자가 공유 시트를 닫은 경우를 포함해 조용히 원래 화면으로 돌아간다.
    }
  };

  const toggleExpanded = (key: BucketKey) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const previewCount = filtered.filter((event) => event.preview).length;
  const emptyTitle =
    view === "saved"
      ? "아직 기다리는 이벤트가 없습니다."
      : view === "mine"
        ? "선택한 관심사에 맞는 이벤트가 없습니다."
        : "조건에 맞는 이벤트가 없습니다.";

  return (
    <>
      {featured ? (
        <section id="top" className="spotlight" aria-labelledby="spotlight-title">
          <div className="hero-manifesto">
            <div>
              <p className="eyebrow">THE REDLINE / NEXT 30 DAYS</p>
              <h1 id="spotlight-title">도파민브로스</h1>
            </div>
            <p className="hero-deck">결승전, 대작 출시, 신제품 발표.<br />달력에 빨간 줄 그을 순간만.</p>
          </div>
          <EventCard
            event={featured}
            today={today}
            saved={saved.has(featured.id)}
            onToggleSaved={toggleSaved}
            onShare={handleShare}
            shared={sharedId === featured.id}
            featured
          />
          <div className="signal-ticker" aria-label="다가오는 이벤트 요약">
            <span className="ticker-label"><i aria-hidden /> DPMBROS SIGNAL</span>
            <span><strong>{curatedCount}</strong> CURATED</span>
            <span><strong>{liveCount}</strong> LIVE NOW</span>
            <span><strong>30</strong> DAYS AHEAD</span>
            <span className="ticker-copy">SPORTS / GAME / TECH / BIG MOMENTS</span>
          </div>
        </section>
      ) : null}

      <div className="discovery-controls">
        <div className="feed-tabs" role="tablist" aria-label="피드 보기 방식">
          <button
            type="button"
            role="tab"
            aria-selected={view === "curated"}
            onClick={() => chooseView("curated")}
            className={view === "curated" ? "feed-tab feed-tab-active" : "feed-tab"}
          >
            지금 뜨는 것
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "mine"}
            onClick={() => chooseView("mine")}
            className={view === "mine" ? "feed-tab feed-tab-active" : "feed-tab"}
          >
            내 레이더 <span>{interests.size}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "saved"}
            onClick={() => chooseView("saved")}
            className={view === "saved" ? "feed-tab feed-tab-active" : "feed-tab"}
          >
            기대 중 <span>{saved.size}</span>
          </button>
          <button type="button" className="edit-interests" onClick={openInterestPicker}>
            관심사 조정
          </button>
        </div>

        <nav className="filter-bar" aria-label="이벤트 카테고리">
          <div className="filter-scroll no-scrollbar">
            <button
              type="button"
              onClick={() => setCategory(null)}
              aria-pressed={category === null}
              className={category === null ? "filter-chip filter-chip-active" : "filter-chip"}
            >
              모두
            </button>
            {visibleCategories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                aria-pressed={category === item}
                className={category === item ? "filter-chip filter-chip-active" : "filter-chip"}
              >
                <span className={`sport-dot ${INTEREST_STYLE[item].dot}`} aria-hidden />
                {item}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {ready && !configured && (
        <button type="button" className="radar-callout" onClick={openInterestPicker}>
          <span className="radar-icon" aria-hidden><i /></span>
          <span>
            <small>PERSONAL RADAR</small>
            <strong>원하는 것만 더 세게 받아보세요.</strong>
          </span>
          <em>내 레이더 켜기 →</em>
        </button>
      )}

      {previewCount > 0 && (
        <div className="preview-banner" role="note">
          <span>PREVIEW</span>
          표시된 이벤트 {previewCount}개는 자동 수집 연결 전 관심사 경험을 확인하기 위한 예시입니다.
        </div>
      )}

      {!featured ? (
        <section className="empty-state compact-empty">
          <p className="eyebrow">NOTHING HERE YET</p>
          <h2>{emptyTitle}</h2>
          <p>{view === "mine" ? "관심사를 더 선택하거나 지금 뜨는 것을 확인해보세요." : "마음에 드는 카드에서 ‘기대 걸기’를 눌러 모아보세요."}</p>
          <button
            type="button"
            onClick={view === "mine" ? openInterestPicker : () => chooseView("curated")}
            className="empty-action"
          >
            {view === "mine" ? "관심사 다시 선택" : "지금 뜨는 것 보기"}
          </button>
        </section>
      ) : null}

      {featured && (
        <div className="timeline">
          {BUCKETS.map((bucket) => {
            const all = grouped.get(bucket.key) ?? [];
            if (all.length === 0) return null;
            const isExpanded = expanded.has(bucket.key);
            const shown = isExpanded ? all : all.slice(0, bucket.limit);
            return (
              <section className="time-section" key={bucket.key} aria-labelledby={`bucket-${bucket.key}`}>
                <div className="time-rail" aria-hidden>
                  <span>{bucket.index}</span>
                  <i />
                </div>
                <div className="time-content">
                  <div className="section-heading">
                    <div>
                      <span>{bucket.description}</span>
                      <h2 id={`bucket-${bucket.key}`}>{bucket.label}</h2>
                    </div>
                    <p>{all.length}개의 추천 이벤트</p>
                  </div>
                  <div className="event-grid">
                    {shown.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        today={today}
                        saved={saved.has(event.id)}
                        onToggleSaved={toggleSaved}
                        onShare={handleShare}
                        shared={sharedId === event.id}
                      />
                    ))}
                  </div>
                  {all.length > bucket.limit && (
                    <button type="button" className="more-button" onClick={() => toggleExpanded(bucket.key)}>
                      {isExpanded ? "간단히 보기" : `${all.length - bucket.limit}개 더 보기`}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="all-events-toggle">
        <div>
          <strong>{showAll ? "전체 판 보기" : "선별 모드"}</strong>
          <span>{showAll ? "수집된 모든 신호를 펼쳤습니다." : "기대도 70 이상의 강한 신호만 보여드립니다."}</span>
        </div>
        <button type="button" onClick={() => setShowAll((value) => !value)} aria-pressed={showAll}>
          {showAll ? "선별 모드" : "전체 판 보기"}
        </button>
      </div>

      <InterestPicker
        open={pickerOpen}
        selected={draftInterests}
        onToggle={toggleDraftInterest}
        onSave={applyInterests}
        onClose={closeInterestPicker}
      />
    </>
  );
}
