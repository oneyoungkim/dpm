"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { formatDateKo, formatTimeKo, dateKey } from "@/lib/kst";
import { INTEREST_STYLE } from "@/lib/interests";
import { INTEREST_CATEGORIES, type InterestCategory } from "@/lib/types";
import { appPlatform, isApp, native, tap } from "@/lib/app/native";
import { PREFS_RESTORED_EVENT } from "@/lib/app/prefs";
import {
  BRIEFING_TIMES,
  SAVED_LEADS,
  leadLabel,
  type AlertSettings,
  type BriefingTime,
  type SavedLead,
} from "@/lib/app/alerts";
import {
  alertPermission,
  loadAlertSettings,
  loadInterests,
  loadSavedIds,
  pendingAlerts,
  requestAlertPermission,
  saveAlertSettings,
  sendTestAlert,
  syncAlerts,
  type PendingView,
  type PermissionView,
} from "@/lib/app/sync";

function whenLabel(at: Date | null): string {
  if (!at) return "";
  return `${formatDateKo(dateKey(at))} ${formatTimeKo(at.toISOString())}`;
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  render,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly T[];
  render: (option: T) => string;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="alert-choice" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option)}
          type="button"
          role="radio"
          aria-checked={option === value}
          disabled={disabled}
          className={option === value ? "alert-chip alert-chip-active" : "alert-chip"}
          onClick={() => onChange(option)}
        >
          {render(option)}
        </button>
      ))}
    </div>
  );
}

export function AlertsPanel() {
  const [inApp, setInApp] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<PermissionView>("unavailable");
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [pending, setPending] = useState<PendingView[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [version, setVersion] = useState("");
  const [testSent, setTestSent] = useState(false);

  const refresh = useCallback(async () => {
    setSettings(loadAlertSettings());
    setInterests(loadInterests());
    setSavedCount(loadSavedIds().length);
    setPermission(await alertPermission());
    setPending(await pendingAlerts().catch(() => []));
  }, []);

  useEffect(() => {
    const app = isApp();
    setInApp(app);
    if (!app) return;
    void refresh();
    void native().then((n) => n?.App.getInfo().then((info) => setVersion(`${info.version} (${info.build})`)).catch(() => undefined));
    const onRestored = () => void refresh();
    window.addEventListener(PREFS_RESTORED_EVENT, onRestored);
    // 휴대폰 설정에서 알림을 켜고 돌아오면 상태를 다시 읽는다.
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(PREFS_RESTORED_EVENT, onRestored);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const update = async (patch: Partial<AlertSettings>) => {
    if (!settings) return;
    tap();
    const next = { ...settings, ...patch, onboarded: true };
    setSettings(next);
    saveAlertSettings(next);
    await syncAlerts().catch(() => undefined);
    setPending(await pendingAlerts().catch(() => []));
  };

  const turnOn = async () => {
    tap();
    const result = await requestAlertPermission();
    setPermission(result);
    if (result === "granted") {
      await syncAlerts().catch(() => undefined);
      setPending(await pendingAlerts().catch(() => []));
    }
  };

  const test = async () => {
    tap("MEDIUM");
    const ok = await sendTestAlert();
    setPermission(await alertPermission());
    if (ok) {
      setTestSent(true);
      window.setTimeout(() => setTestSent(false), 6000);
    }
  };

  if (inApp === null) return <div className="alerts-loading" aria-hidden />;

  if (!inApp) {
    return (
      <section className="alerts-web">
        <h2>알림은 각지지 앱에서 받을 수 있어요</h2>
        <ul>
          <li>저장한 경기·출시: 시작 10분·30분·1시간 전에</li>
          <li>관심 종목 요약: 고른 시각에 그날 일정만 모아서</li>
          <li>메인 이벤트: 시작 1시간 전에</li>
        </ul>
        <p>
          웹에서는 <Link href="/schedule">일정</Link>에서 ‘일정 저장’과 ‘관심사 조정’을 그대로 쓸 수 있어요. 고른 것은 이
          브라우저에만 남아요.
        </p>
      </section>
    );
  }

  const off = permission !== "granted";
  const picked = INTEREST_CATEGORIES.filter((category) => interests.includes(category));

  return (
    <div className="alerts">
      {off ? (
        <section className="alerts-permission">
          <h2>알림이 꺼져 있어요</h2>
          {permission === "denied" ? (
            <>
              <p>
                {appPlatform() === "ios"
                  ? "휴대폰 설정 › 앱 › 각지지 › 알림에서 ‘알림 허용’을 켜 주세요."
                  : "휴대폰 설정 › 애플리케이션 › 각지지 › 알림에서 켜 주세요."}
              </p>
              {appPlatform() === "ios" ? (
                <a className="alerts-primary" href="app-settings:">
                  설정 열기
                </a>
              ) : null}
            </>
          ) : (
            <>
              <p>저장한 경기 시작 전, 관심 종목 요약을 알림으로 받아 보세요.</p>
              <button type="button" className="alerts-primary" onClick={() => void turnOn()}>
                알림 켜기
              </button>
            </>
          )}
        </section>
      ) : null}

      {settings ? (
        <>
          <section className="alerts-group">
            <header>
              <h2>저장한 일정</h2>
              <p>
                저장한 경기·출시 {savedCount}개 · 시작 전에 알려 드려요.{" "}
                <Link href="/schedule?view=saved">저장한 일정 보기 →</Link>
              </p>
            </header>
            <Choice<SavedLead>
              label="저장한 일정 알림 시각"
              value={settings.savedLead}
              options={SAVED_LEADS}
              render={(option) => (option === 0 ? "끔" : `${leadLabel(option)} 전`)}
              onChange={(next) => void update({ savedLead: next })}
              disabled={off}
            />
          </section>

          <section className="alerts-group">
            <header>
              <h2>관심 종목 요약</h2>
              <p>고른 시각에 그날 관심 종목 일정만 모아 한 번. 일정이 없는 날은 조용히 넘어가요.</p>
            </header>
            <Choice<BriefingTime>
              label="관심 종목 요약 시각"
              value={settings.briefing}
              options={BRIEFING_TIMES}
              render={(option) => (option === "" ? "끔" : option)}
              onChange={(next) => void update({ briefing: next })}
              disabled={off}
            />
            <div className="alerts-interests">
              {picked.map((category) => (
                <span key={category} className="alerts-interest">
                  <i className={INTEREST_STYLE[category as InterestCategory].dot} aria-hidden />
                  {category}
                </span>
              ))}
              <Link href="/schedule?pick=1" className="alerts-link">
                관심 종목 고르기 →
              </Link>
            </div>
          </section>

          <section className="alerts-group">
            <header>
              <h2>메인 이벤트</h2>
              <p>첫 화면 맨 위의 이번 주 메인 이벤트를 시작 1시간 전에.</p>
            </header>
            <Choice<"on" | "off">
              label="메인 이벤트 알림"
              value={settings.mainEvent ? "on" : "off"}
              options={["on", "off"] as const}
              render={(option) => (option === "on" ? "받기" : "끔")}
              onChange={(next) => void update({ mainEvent: next === "on" })}
              disabled={off}
            />
          </section>
        </>
      ) : null}

      <section className="alerts-group">
        <header>
          <h2>예약된 알림</h2>
          <p>앱을 열 때마다 최신 일정으로 다시 맞춰요. 시각은 한국 시간이에요.</p>
        </header>
        {pending.length === 0 ? (
          <p className="alerts-empty">
            {off ? "알림을 켜면 여기에 예약이 보여요." : "아직 예약된 알림이 없어요. 일정에서 ‘일정 저장’을 눌러 보세요."}
          </p>
        ) : (
          <ol className="alerts-list">
            {pending.slice(0, 8).map((item) => (
              <li key={item.id}>
                <time>{whenLabel(item.at)}</time>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </li>
            ))}
            {pending.length > 8 ? <li className="alerts-more">외 {pending.length - 8}개</li> : null}
          </ol>
        )}
        <button type="button" className="alerts-test" onClick={() => void test()}>
          {testSent ? "5초 뒤에 시험 알림이 와요" : "시험 알림 보내기"}
        </button>
      </section>

      <section className="alerts-about">
        <p>
          알림은 휴대폰 안에서만 예약해요. 저장한 일정과 관심 종목은 이 휴대폰에만 남고, 서버로 보내지 않아요.
        </p>
        <nav aria-label="앱 정보">
          <Link href="/about">소개·편집 원칙</Link>
          <Link href="/privacy">개인정보 처리방침</Link>
          {BRAND.contactEmail ? <a href={`mailto:${BRAND.contactEmail}`}>문의</a> : null}
        </nav>
        {version ? (
          <p className="alerts-version">
            {BRAND.name} 앱 {version}
          </p>
        ) : null}
      </section>
    </div>
  );
}
