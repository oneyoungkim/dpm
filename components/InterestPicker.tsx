"use client";

import { useEffect } from "react";
import { INTEREST_STYLE } from "@/lib/interests";
import { INTEREST_CATEGORIES, type InterestCategory } from "@/lib/types";

export function InterestPicker({
  open,
  selected,
  onToggle,
  onSave,
  onClose,
}: {
  open: boolean;
  selected: Set<InterestCategory>;
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
            <p className="eyebrow">MAKE IT YOURS</p>
            <h2 id="interest-title">무엇을 기다리시나요?</h2>
            <p>선택한 관심사만 모은 나만의 30일 피드를 만듭니다.</p>
          </div>
          <button type="button" onClick={onClose} className="interest-close" aria-label="관심사 선택 닫기">
            닫기
          </button>
        </div>

        <div className="interest-grid">
          {INTEREST_CATEGORIES.map((category) => {
            const active = selected.has(category);
            const style = INTEREST_STYLE[category];
            return (
              <button
                key={category}
                type="button"
                onClick={() => onToggle(category)}
                aria-pressed={active}
                className={active ? "interest-option interest-option-active" : "interest-option"}
              >
                <span className="interest-option-top">
                  <i className={style.dot} aria-hidden />
                  <strong>{category}</strong>
                  <span className="interest-check" aria-hidden>{active ? "✓" : "+"}</span>
                </span>
                <small>{style.description}</small>
              </button>
            );
          })}
        </div>

        <div className="interest-panel-foot">
          <p>
            <strong>{selected.size}</strong>개 선택
          </p>
          <button type="button" onClick={onSave} disabled={selected.size === 0} className="interest-save">
            내 피드 만들기
          </button>
        </div>
      </section>
    </div>
  );
}
