"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InterestCategory, SportEvent } from "@/lib/types";
import { INTEREST_CATEGORIES } from "@/lib/types";
import { diffDays } from "@/lib/kst";
import { DEFAULT_INTERESTS, INTEREST_STYLE, interestCategoryOf } from "@/lib/interests";
import { isCuratedEvent } from "@/lib/curation";
import { EventCard } from "./EventCard";
import { InterestPicker } from "./InterestPicker";
import { BRAND } from "@/lib/brand";
import {
  INTEREST_STORAGE_KEY,
  LEGACY_ALARM_KEY,
  PREFS_RESTORED_EVENT,
  SAVED_STORAGE_KEY,
  notifyPrefsChanged,
} from "@/lib/app/prefs";
import { shareLink } from "@/lib/app/native";

type FeedView = "curated" | "mine" | "saved";
type BucketKey = "today" | "tomorrow" | "week" | "later";

const BUCKETS: Array<{ key: BucketKey; index: string; label: string; description: string; limit: number }> = [
  { key: "today", index: "01", label: "오늘", description: "오늘 · 진행 중", limit: 6 },
  { key: "tomorrow", index: "02", label: "내일", description: "내일부터", limit: 6 },
  { key: "week", index: "03", label: "이번 주", description: "7일 내 주요 경기·출시", limit: 10 },
  { key: "later", index: "04", label: "그 이후", description: "다음 주 이후 주요 일정", limit: 12 },
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
    const read = () => {
      try {
        const current = localStorage.getItem(SAVED_STORAGE_KEY);
        const legacy = localStorage.getItem(LEGACY_ALARM_KEY);
        const ids = current ? (JSON.parse(current) as string[]) : legacy ? (JSON.parse(legacy) as string[]) : [];
        setSaved(new Set(ids));
      } catch {
        // 저장소가 막혀 있어도 탐색 기능은 정상적으로 동작한다.
      }
    };
    read();
    // 앱이 휴대폰 저장소에서 값을 되살리면 다시 읽는다.
    window.addEventListener(PREFS_RESTORED_EVENT, read);
    return () => window.removeEventListener(PREFS_RESTORED_EVENT, read);
  }, []);

  const toggleSaved = (id: string) => {
    const adding = !saved.has(id);
    const next = new Set(saved);
    if (adding) next.add(id);
    else next.delete(id);
    setSaved(next);
    try {
      localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // 저장 실패 시 현재 탭에서는 상태를 유지한다.
    }
    // 앱에서는 이것을 듣고 시작 전 알림을 건다.
    notifyPrefsChanged({ reason: adding ? "saved-add" : "saved-remove", eventId: id });
  };

  return { saved, toggleSaved };
}

function useInterests() {
  // 관심사는 현재 30일 일정과 무관하게 유지한다. 드문 대회도 미리 구독할 수 있어야 한다.
  const [interests, setInterests] = useState<Set<InterestCategory>>(new Set(DEFAULT_INTERESTS));
  const [configured, setConfigured] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => {
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
    };
    read();
    window.addEventListener(PREFS_RESTORED_EVENT, read);
    return () => window.removeEventListener(PREFS_RESTORED_EVENT, read);
  }, []);

  const saveInterests = (next: Set<InterestCategory>) => {
    setInterests(new Set(next));
    setConfigured(true);
    try {
      localStorage.setItem(INTEREST_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // 현재 탭에서는 선택을 유지한다.
    }
    notifyPrefsChanged({ reason: "interests" });
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
  articles = {},
}: {
  events: SportEvent[];
  today: string;
  activeCategories: InterestCategory[];
  featuredId?: string;
  curatedCount: number;
  liveCount: number;
  /** 일정 id → 소개 글. 서버에서 넘기므로 Map 대신 일반 객체. */
  articles?: Record<string, { slug: string; title: string }>;
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
  const availableCategories = useMemo(() => new Set(activeCategories), [activeCategories]);

  useEffect(() => {
    if (ready && configured) {
      setView("mine");
    }
  }, [configured, ready]);

  // 알림·앱 탭에서 들어올 때: ?view=saved|mine 으로 보기를 고르고, ?pick=1 이면 관심 종목 고르기를 연다.
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const wantedView = params.get("view");
    if (wantedView === "saved" || wantedView === "mine") setView(wantedView);
    if (params.get("pick") === "1") {
      setDraftInterests(new Set(interests));
      setPickerOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번만 본다
  }, [ready]);

  // #ev-… 로 들어오면 그 카드로 내려가 잠깐 빛나게 한다(알림을 눌렀을 때).
  useEffect(() => {
    if (!ready) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash.startsWith("ev-")) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(hash);
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.classList.add("event-flash");
      window.setTimeout(() => target.classList.remove("event-flash"), 2400);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [ready, view]);

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
    // 저장함·내 관심사·직접 고른 카테고리는 사용자의 명시적 선택이므로
    // 하이프 점수로 다시 숨기지 않는다. 기본 피드만 선별 규칙을 적용한다.
    if (!showAll && view === "curated" && category === null) {
      result = result.filter(isCuratedEvent);
    }
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
    const text = `${event.title} · ${dday}\n${event.series ?? event.league} · ${BRAND.name}`;
    const url = `${BRAND.url}/schedule#ev-${encodeURIComponent(event.id)}`;
    // 앱에서는 휴대폰 공유 시트, 웹에서는 브라우저 공유(없으면 복사). 시트를 닫으면 조용히 돌아간다.
    const result = await shareLink({ title: event.title, text, url });
    if (result === "failed") return;
    setSharedId(event.id);
    window.setTimeout(() => setSharedId(null), 1800);
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
              <p className="eyebrow">볼 각 / 앞으로 30일</p>
              <h1 id="spotlight-title">30일 일정</h1>
            </div>
            <p className="hero-deck">결승전, 대작 출시, 신제품 발표.<br />챙겨 볼 일정만 추렸습니다.</p>
          </div>
          <EventCard
            event={featured}
            today={today}
            saved={saved.has(featured.id)}
            onToggleSaved={toggleSaved}
            onShare={handleShare}
            shared={sharedId === featured.id}
            featured
            article={articles[featured.id]}
          />
          <div className="signal-ticker" aria-label="다가오는 이벤트 요약">
            <span className="ticker-label"><i aria-hidden /> 앞으로 30일</span>
            <span>주요 일정 <strong>{curatedCount}</strong></span>
            <span>지금 진행 중 <strong>{liveCount}</strong></span>
            <span className="ticker-copy">스포츠 · 게임 · 테크</span>
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
            <strong>보고 싶은 종목만 골라 보세요.</strong>
          </span>
          <em>관심만 보기 →</em>
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
          <p>{view === "mine" ? "지금은 일정이 없습니다. 관심 종목을 더 골라 보세요." : "보고 싶은 일정에서 ‘일정 저장’을 눌러 모아 보세요."}</p>
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
                        article={articles[event.id]}
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
          <span>{showAll ? "전체 일정을 보여 줍니다." : "주요 일정과 핵심 격투기 경기만 보여 줍니다."}</span>
        </div>
        <button type="button" onClick={() => setShowAll((value) => !value)} aria-pressed={showAll}>
          {showAll ? "선별 모드" : "전체 판 보기"}
        </button>
      </div>

      <InterestPicker
        open={pickerOpen}
        selected={draftInterests}
        available={availableCategories}
        onToggle={toggleDraftInterest}
        onSave={applyInterests}
        onClose={closeInterestPicker}
      />
    </>
  );
}
