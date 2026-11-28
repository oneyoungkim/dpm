/**
 * 앱 알림 계획표(lib/app/alerts.ts) 자체 시험. 브라우저·휴대폰 없이 돈다.
 *   npm run app:selftest
 */
import assert from "node:assert/strict";
import type { SportEvent } from "../../lib/types";
import {
  DEFAULT_ALERT_SETTINGS,
  MAX_PENDING,
  alertId,
  normalizeAlertSettings,
  planAlerts,
  type AlertSettings,
} from "../../lib/app/alerts";

const today = "2026-12-01";
const now = new Date("2026-12-01T07:00:00+09:00");

function ev(id: string, startsAt: string, extra: Partial<SportEvent> = {}): SportEvent {
  return {
    id,
    sport: "격투기",
    league: "UFC",
    leagueKey: "ufc",
    title: `경기 ${id}`,
    startsAt,
    dateKey: startsAt.slice(0, 10),
    status: "예정",
    hype: 60,
    ...extra,
  } as SportEvent;
}

const events: SportEvent[] = [
  ev("a", "2026-12-01T21:00:00+09:00", { hype: 90 }),
  ev("b", "2026-12-02T12:00:00+09:00", { sport: "축구", league: "EPL", leagueKey: "epl" }),
  ev("c", "2026-12-03T00:00:00+09:00", { timeTbd: true, category: "게임", sport: "기타", league: "출시" }),
  ev("d", "2026-12-01T07:20:00+09:00"), // 30분 전 시각이 이미 지남
  ev("x", "2026-12-04T20:00:00+09:00", { status: "취소" }),
];
const settings: AlertSettings = { ...DEFAULT_ALERT_SETTINGS, onboarded: true };

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

test("저장한 경기는 시작 30분 전", () => {
  const plan = planAlerts({ events, saved: ["a"], interests: [], settings: { ...settings, mainEvent: false }, now, today });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, "saved");
  assert.equal(plan[0].at.toISOString(), new Date("2026-12-01T20:30:00+09:00").toISOString());
  assert.match(plan[0].body, /^30분 뒤 시작 · UFC/);
  assert.equal(plan[0].url, "/schedule?view=saved#ev-a");
});

test("시각 미정 일정은 그날 아침 9시", () => {
  const plan = planAlerts({ events, saved: ["c"], interests: [], settings: { ...settings, mainEvent: false }, now, today });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].at.toISOString(), new Date("2026-12-03T09:00:00+09:00").toISOString());
  assert.match(plan[0].title, /^오늘 · /);
});

test("이미 지난 시각·취소 일정은 빼기", () => {
  const plan = planAlerts({ events, saved: ["d", "x"], interests: [], settings: { ...settings, mainEvent: false }, now, today });
  assert.equal(plan.length, 0);
});

test("저장 알림을 끄면 저장 알림 없음", () => {
  const plan = planAlerts({ events, saved: ["a"], interests: [], settings: { ...settings, savedLead: 0, mainEvent: false }, now, today });
  assert.equal(plan.length, 0);
});

test("관심 종목 요약은 일정 있는 날만, 고른 시각에", () => {
  const plan = planAlerts({ events, saved: [], interests: ["격투기"], settings: { ...settings, mainEvent: false }, now, today });
  const briefings = plan.filter((item) => item.kind === "briefing");
  // 12-01 09:00 에 a 만(d는 07:20에 이미 시작). 12-02 축구·12-03 게임은 관심 밖.
  assert.equal(briefings.length, 1);
  assert.equal(briefings[0].at.toISOString(), new Date("2026-12-01T09:00:00+09:00").toISOString());
  assert.equal(briefings[0].title, "오늘 볼 각 1개");
  assert.equal(briefings[0].body, "21:00 경기 a");
});

test("메인 이벤트는 1시간 전, 저장했으면 저장 알림만", () => {
  const onlyMain = planAlerts({ events, saved: [], interests: [], settings, now, today });
  const main = onlyMain.find((item) => item.kind === "main");
  assert.ok(main);
  assert.equal(main.at.toISOString(), new Date("2026-12-01T20:00:00+09:00").toISOString());
  const both = planAlerts({ events, saved: ["a"], interests: [], settings, now, today });
  assert.equal(both.filter((item) => item.kind === "main" && item.url.includes("ev-a")).length, 0);
});

test("예약은 60개까지, 시각 순", () => {
  const many = Array.from({ length: 90 }, (_, i) =>
    ev(`m${i}`, new Date(Date.parse("2026-12-02T00:00:00+09:00") + i * 3_600_000).toISOString().replace("Z", "+00:00")),
  ).map((event) => ({ ...event, dateKey: "2026-12-02" }));
  const plan = planAlerts({ events: many, saved: many.map((e) => e.id), interests: [], settings: { ...settings, mainEvent: false }, now, today });
  assert.equal(plan.length, MAX_PENDING);
  for (let i = 1; i < plan.length; i += 1) assert.ok(plan[i - 1].at <= plan[i].at);
});

test("번호는 같은 열쇠면 같고 1 이상 int", () => {
  assert.equal(alertId("saved:a"), alertId("saved:a"));
  assert.notEqual(alertId("saved:a"), alertId("saved:b"));
  for (const key of ["", "x", "briefing:2026-12-01:09:00"]) {
    const id = alertId(key);
    assert.ok(Number.isInteger(id) && id >= 1 && id <= 0x7fffffff);
  }
});

test("깨진 설정은 기본값으로", () => {
  assert.deepEqual(normalizeAlertSettings(null), DEFAULT_ALERT_SETTINGS);
  assert.deepEqual(normalizeAlertSettings({ savedLead: 15, briefing: "07:00", mainEvent: "y" }), DEFAULT_ALERT_SETTINGS);
  assert.equal(normalizeAlertSettings({ savedLead: 10, briefing: "", mainEvent: false, onboarded: true }).briefing, "");
});

console.log(`앱 알림 계획표 시험 ${passed}개 통과`);
