"use client";

import React from "react";
import { ui } from "@/components/ui/classes";
import type { RoadmapRecord } from "@/lib/roadmap/types";

function planLabel(record: RoadmapRecord): string {
  const exam = record.intake.examName.trim() || "your exam";
  const days = record.plan.days.length;
  return `${exam} · ${days} day${days === 1 ? "" : "s"} · updated ${record.updatedAt.slice(0, 10)}`;
}

export function RoadmapImportDialog({
  local,
  onKeepAccount,
  onKeepDevice,
}: {
  local: RoadmapRecord;
  onKeepAccount: () => void;
  onKeepDevice: () => void;
}) {
  return (
    <div className={ui.backdrop} data-testid="roadmap-import-prompt" role="dialog" aria-modal="true" aria-labelledby="roadmap-import-title">
      <div className={ui.modal}>
        <p className={ui.eyebrow}>This device has a plan</p>
        <h2 id="roadmap-import-title" className={`${ui.heading} mt-2 text-xl`}>
          Keep this study plan in your account?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Your account does not have a study plan yet. This device already has one ({planLabel(local)}).
          Nothing is uploaded until you choose.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" data-testid="roadmap-import-keep-account" className={ui.primary} onClick={onKeepAccount}>
            Keep in my account
          </button>
          <button type="button" data-testid="roadmap-import-keep-device" className={ui.secondary} onClick={onKeepDevice}>
            Keep on this device only
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoadmapConflictDialog({
  local,
  remote,
  onKeepDevice,
  onKeepAccount,
  onKeepBoth,
}: {
  local: RoadmapRecord;
  remote: RoadmapRecord;
  onKeepDevice: () => void;
  onKeepAccount: () => void;
  onKeepBoth: () => void;
}) {
  return (
    <div className={ui.backdrop} data-testid="roadmap-conflict" role="dialog" aria-modal="true" aria-labelledby="roadmap-conflict-title">
      <div className={ui.modal}>
        <p className={ui.eyebrow}>Two copies of your plan</p>
        <h2 id="roadmap-conflict-title" className={`${ui.heading} mt-2 text-xl`}>
          Choose which study plan to keep
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This device and your account have different plans. Your work on this device stays until you choose.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-ink">
          <li>
            <span className="text-muted">This device: </span>
            {planLabel(local)}
          </li>
          <li>
            <span className="text-muted">Account: </span>
            {planLabel(remote)}
          </li>
        </ul>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" data-testid="roadmap-keep-device" className={ui.primary} onClick={onKeepDevice}>
            Keep this device
          </button>
          <button type="button" data-testid="roadmap-keep-account" className={ui.secondary} onClick={onKeepAccount}>
            Keep account
          </button>
          <button type="button" data-testid="roadmap-keep-both" className={ui.ghost} onClick={onKeepBoth}>
            Keep both
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Keep both saves a dated copy of this device’s plan, downloads it, then opens the account plan.
        </p>
      </div>
    </div>
  );
}

export function RoadmapSyncNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className={`${ui.notice} mt-6`} data-testid="roadmap-sync-error">
      <p>{message}</p>
      {onRetry && (
        <button type="button" data-testid="roadmap-sync-retry" className={`${ui.secondary} mt-3`} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
