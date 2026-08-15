"use client";

import { useEffect } from "react";
import { INTEREST_STYLE } from "@/lib/interests";
import { INTEREST_CATEGORIES, type InterestCategory } from "@/lib/types";

export function InterestPicker({
  open,
  selected,
  available,
  onToggle,
  onSave,
  onClose,
}: {
  open: boolean;
  selected: Set<InterestCategory>;
  /** 지금 실제로 일정이 잡힌 카테고리. 나머지는 골라도 빈 레이더가 되므로 잠근다. */
  available: Set<InterestCategory>;
  onToggle: (category: InterestCategory) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="interest-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="interest-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="interest-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="interest-panel-head">
          <div>
            <p className="eyebrow">TUNE YOUR RADAR</p>
            <h2 id="interest-title">당신의 심장을 뛰게 하는 것은?</h2>
            <p>강한 신호만 고르세요. 선택한 관심사로 나만의 30일 레이더를 만듭니다.</p>
          </div>
          <button type="button" onClick={onClose} className="interest-close" aria-label="관심사 선택 닫기">
            닫기
          </button>
        </div>

        <div className="interest-grid">
          {INTEREST_CATEGORIES.map((category) => {
            const ready = available.has(category);
            const active = ready && selected.has(category);
            const style = INTEREST_STYLE[category];
            const className = [
              "interest-option",
              active ? "interest-option-active" : "",
              ready ? "" : "interest-option-pending",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={category}
                type="button"
                onClick={() => ready && onToggle(category)}
                aria-pressed={active}
                disabled={!ready}
                title={ready ? undefined : "아직 수집된 일정이 없습니다"}
                className={className}
              >
                <span className="interest-option-top">
                  <i className={style.dot} aria-hidden />
                  <strong>{category}</strong>
                  <span className="interest-check" aria-hidden>
                    {ready ? (active ? "✓" : "+") : "—"}
                  </span>
                </span>
                <small>{ready ? style.description : "준비 중"}</small>
              </button>
            );
          })}
        </div>

        <div className="interest-panel-foot">
          <p>
            <strong>{selected.size}</strong>개 선택
          </p>
          <button type="button" onClick={onSave} disabled={selected.size === 0} className="interest-save">
            내 레이더 켜기
          </button>
        </div>
      </section>
    </div>
  );
}
