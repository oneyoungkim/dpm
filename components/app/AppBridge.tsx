"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isApp, native, tap } from "@/lib/app/native";
import {
  MIRRORED_KEYS,
  PREFS_CHANGED_EVENT,
  PREFS_RESTORED_EVENT,
  type PrefsChangeDetail,
} from "@/lib/app/prefs";
import {
  alertPermission,
  loadAlertSettings,
  requestAlertPermission,
  saveAlertSettings,
  syncAlerts,
} from "@/lib/app/sync";
import { leadLabel } from "@/lib/app/alerts";

/**
 * 앱 안에서만 도는 연결부. 웹 브라우저에서는 아무것도 그리지 않는다.
 *  - 저장·관심·알림 설정을 휴대폰 저장소와 맞춘다(웹뷰 저장소가 지워져도 되살림).
 *  - 알림 예약을 다시 맞춘다(앱을 열 때, 돌아올 때, 저장이 바뀔 때).
 *  - 알림을 누르면 그 일정 자리로 간다.
 *  - 바깥 사이트 링크는 앱 안 브라우저 창으로 연다.
 *  - 처음 연 사람에게 알림을 켤지 한 번 묻는다.
 */
export function AppBridge() {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [askAlerts, setAskAlerts] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    if (!isApp()) return;
    let disposed = false;
    const removers: Array<() => void> = [];

    const mirror = async () => {
      const n = await native();
      if (!n) return;
      for (const key of MIRRORED_KEYS) {
        const value = localStorage.getItem(key);
        if (value !== null) await n.Preferences.set({ key, value }).catch(() => undefined);
      }
    };

    const onPrefsChanged = (event: Event) => {
      const detail = (event as CustomEvent<PrefsChangeDetail>).detail;
      void mirror();
      void (async () => {
        if (detail?.reason === "saved-add") {
          tap("MEDIUM");
          const settings = loadAlertSettings();
          if (settings.savedLead === 0) {
            showToast("저장했어요. 알림 탭에서 시작 전 알림을 켤 수 있어요.");
          } else {
            let permission = await alertPermission();
            if (permission === "prompt") permission = await requestAlertPermission();
            if (!settings.onboarded) saveAlertSettings({ ...settings, onboarded: true });
            showToast(
              permission === "granted"
                ? `저장했어요. 시작 ${leadLabel(settings.savedLead)} 전에 알려 드릴게요.`
                : "저장했어요. 알림을 받으려면 휴대폰 설정에서 각지지 알림을 켜 주세요.",
            );
          }
        }
        await syncAlerts().catch(() => undefined);
      })();
    };
    window.addEventListener(PREFS_CHANGED_EVENT, onPrefsChanged);
    removers.push(() => window.removeEventListener(PREFS_CHANGED_EVENT, onPrefsChanged));

    // 바깥 사이트 링크 → 앱 안 브라우저 창. 같은 사이트의 새 창 링크는 이 창에서 연다.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") return;
      if (url.host === window.location.host) {
        if (anchor.target === "_blank") {
          event.preventDefault();
          window.location.assign(url.href);
        }
        return;
      }
      event.preventDefault();
      void native().then((n) => n?.Browser.open({ url: url.href, toolbarColor: "#090a0b", presentationStyle: "fullscreen" }));
    };
    document.addEventListener("click", onClick, true);
    removers.push(() => document.removeEventListener("click", onClick, true));

    void (async () => {
      const n = await native();
      if (!n || disposed) return;

      // 1. 휴대폰 저장소 ↔ 웹뷰 저장소
      let restored = false;
      for (const key of MIRRORED_KEYS) {
        const local = localStorage.getItem(key);
        const { value } = await n.Preferences.get({ key }).catch(() => ({ value: null }));
        if (local === null && value !== null) {
          try {
            localStorage.setItem(key, value);
            restored = true;
          } catch {
            // 웹뷰 저장소가 막혀 있으면 휴대폰 저장소 값만 남긴다.
          }
        } else if (local !== null && local !== value) {
          await n.Preferences.set({ key, value: local }).catch(() => undefined);
        }
      }
      if (restored) window.dispatchEvent(new Event(PREFS_RESTORED_EVENT));

      // 2. 알림을 눌렀을 때: 사이트 안 이동(웹뷰 페이지를 새로 열지 않아 빠르고, 이동이 끊길 일이 없다)
      const tapHandle = await n.LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
        const url = action.notification.extra?.url;
        if (typeof url !== "string" || !url.startsWith("/")) return;
        const target = new URL(url, window.location.origin);
        if (target.pathname === window.location.pathname) {
          // 같은 페이지 안이면 보기(?view=)와 카드 자리(#ev-)를 다시 읽도록 새로 연다.
          window.location.replace(target.href);
        } else {
          router.push(url);
        }
      });
      removers.push(() => void tapHandle.remove());

      // 3. 앱으로 돌아올 때: 화면 새로고침 + 알림 다시 맞춤
      const resumeHandle = await n.App.addListener("resume", () => {
        router.refresh();
        void syncAlerts().catch(() => undefined);
      });
      removers.push(() => void resumeHandle.remove());

      await syncAlerts().catch(() => undefined);

      // 4. 처음 연 사람에게 알림 안내 한 번
      const settings = loadAlertSettings();
      if (!settings.onboarded && !disposed) {
        const permission = await alertPermission();
        if (permission === "prompt") window.setTimeout(() => !disposed && setAskAlerts(true), 1200);
        else saveAlertSettings({ ...settings, onboarded: true });
      }
    })();

    return () => {
      disposed = true;
      removers.forEach((remove) => remove());
    };
  }, [router, showToast]);

  const answer = async (turnOn: boolean) => {
    setAskAlerts(false);
    const settings = loadAlertSettings();
    saveAlertSettings({ ...settings, onboarded: true });
    if (!turnOn) return;
    tap();
    const permission = await requestAlertPermission();
    if (permission === "granted") {
      await syncAlerts().catch(() => undefined);
      showToast("알림을 켰어요. 알림 탭에서 시각을 바꿀 수 있어요.");
    } else {
      showToast("알림이 꺼져 있어요. 휴대폰 설정에서 켤 수 있어요.");
    }
  };

  return (
    <>
      {askAlerts ? (
        <div className="app-sheet-backdrop" role="presentation" onClick={() => void answer(false)}>
          <section
            className="app-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">ALERTS</p>
            <h2 id="app-sheet-title">경기 알림을 받아 볼까요?</h2>
            <ul>
              <li>저장한 경기·출시는 시작 30분 전에</li>
              <li>관심 종목은 아침 9시에 그날 일정만 모아서</li>
              <li>이번 주 메인 이벤트는 시작 1시간 전에</li>
            </ul>
            <p className="app-sheet-note">알림은 휴대폰 안에서만 예약하고, 개인정보를 보내지 않아요. 알림 탭에서 언제든 바꿀 수 있어요.</p>
            <div className="app-sheet-actions">
              <button type="button" className="app-sheet-primary" onClick={() => void answer(true)}>
                알림 켜기
              </button>
              <button type="button" className="app-sheet-quiet" onClick={() => void answer(false)}>
                나중에
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {toast ? (
        <p className="app-toast" role="status">
          {toast}
        </p>
      ) : null}
    </>
  );
}
