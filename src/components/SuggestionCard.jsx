import React from "react";

export default function SuggestionCard({ suggestion, onClick }) {
  const { title, severity, originalText, suggestedText, reason } = suggestion;
  const sev = ["high", "medium", "low"].includes(severity)
    ? severity
    : "medium";
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick?.()}
    >
      <div className="card-header">
        <div className="card-title">{title}</div>
        <span className={`badge ${sev}`}>{sev}</span>
      </div>
      <div className="diff">
        {originalText && <div className="diff-old">− {originalText}</div>}
        {suggestedText && <div className="diff-new">+ {suggestedText}</div>}
      </div>
      {reason && <div className="reason">{reason}</div>}
    </div>
  );
}
