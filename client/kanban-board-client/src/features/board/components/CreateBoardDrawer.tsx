"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { UserAvatar } from "./UserAvatar";

/** The five color identity swatches in the Stitch drawer, in order. */
type ColorToken = "primary" | "tertiary" | "secondary" | "error" | "outline";

/** Workflow template preset. Stitch ships two; the enum is open so
 * future presets can be added without an API contract change. */
type WorkflowTemplateId = "software-engineering" | "incident-management";

export interface CreateBoardDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Preselected lead-coordinator email. Defaults to the signed-in
   * user's email so the avatar/initial isn't blank. */
  leadEmail?: string | null;
  /** Optional click handler. The parent wires this to a future
   * `POST /api/boards` call once Phase 5 ships. */
  onCreate?: (args: {
    title: string;
    projectKey: string;
    colorToken: ColorToken;
    workflowTemplate: WorkflowTemplateId;
    autoArchive: boolean;
  }) => void;
}

/**
 * Stitch-faithful "Create Board" right-side drawer — a port of the
 * `#createBoardDrawer` block in `.stitch-cache/share.html` onto the
 * Kinetic Grid tokens.
 *
 * Layout (matches the Stitch HTML one-for-one):
 *   1. Header — `add_circle` icon, "Create Board", close X.
 *   2. Scrollable body — board name, project key + lead
 *      coordinator grid, color identity swatches, workflow
 *      template cards, automation defaults card.
 *   3. Footer — Cancel + Create & Launch Board.
 *
 * The slide-in motion uses the same `translate-x` swap as the
 * Stitch HTML — `translate-x-full` when closed, `translate-x-0`
 * when open — and the `transition-transform duration-300` ease.
 * The body scroll is locked while the drawer is open and `Esc`
 * closes it, matching the `ShareBoardModal` contract.
 */
export function CreateBoardDrawer({
  open,
  onClose,
  leadEmail = null,
  onCreate,
}: CreateBoardDrawerProps) {
  const [title, setTitle] = useState("Infrastructure & Reliability Q4");
  const [projectKey, setProjectKey] = useState("INFRA");
  const [colorToken, setColorToken] = useState<ColorToken>("primary");
  const [workflowTemplate, setWorkflowTemplate] =
    useState<WorkflowTemplateId>("software-engineering");
  const [autoArchive, setAutoArchive] = useState(true);

  // ----- Esc-to-close + body-scroll lock -------------------------------
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const canCreate = title.trim().length > 0 && projectKey.trim().length > 0;

  function handleCreate() {
    if (!canCreate) return;
    onCreate?.({
      title: title.trim(),
      projectKey: projectKey.trim().toUpperCase().slice(0, 6),
      colorToken,
      workflowTemplate,
      autoArchive,
    });
    onClose();
  }

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-board-drawer-title"
      className={[
        "fixed top-0 right-0 bottom-0 w-full max-w-[480px]",
        "bg-surface-container-low shadow-2xl z-50",
        "flex flex-col",
        "transform transition-transform duration-300 ease-in-out",
        open ? "translate-x-0" : "translate-x-full",
      ].join(" ")}
    >
      {/* ---- DRAWER HEADER --------------------------------------- */}
      <div className="px-space-xl pt-space-xl pb-space-md bg-surface-container flex items-start justify-between">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-space-xs">
            <Icon
              name="add_circle"
              className="w-5 h-5 text-secondary shrink-0"
            />
            <h2
              id="create-board-drawer-title"
              className="font-headline-lg text-headline-lg text-on-surface tracking-tight"
            >
              Create Board
            </h2>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Initialize an asynchronous workspace with workflow automation
            defaults.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close drawer"
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors shrink-0"
        >
          <Icon name="close" className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* ---- DRAWER CONTENT (scrollable) ------------------------- */}
      <div className="p-space-xl overflow-y-auto space-y-space-lg flex-1">
        {/* ---- BOARD NAME --------------------------------------- */}
        <div className="flex flex-col gap-space-xs">
          <label
            htmlFor="cb-board-name"
            className="font-label-ui-md text-label-ui-md text-on-surface font-semibold"
          >
            Board Name
          </label>
          <input
            id="cb-board-name"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Q4 Data Pipeline Expansion"
            className="w-full bg-surface-container text-on-surface px-space-md py-2.5 rounded-lg font-body-md text-body-md placeholder:text-outline focus:outline-none focus:bg-surface-container-highest transition-colors"
          />
        </div>

        {/* ---- BOARD IDENTIFIER & KEY --------------------------- */}
        <div className="grid grid-cols-2 gap-space-md">
          <div className="flex flex-col gap-space-xs">
            <label
              htmlFor="cb-project-key"
              className="font-label-ui-md text-label-ui-md text-on-surface font-semibold"
            >
              Project Key
            </label>
            <input
              id="cb-project-key"
              type="text"
              value={projectKey}
              onChange={(e) =>
                setProjectKey(e.target.value.toUpperCase().slice(0, 6))
              }
              maxLength={6}
              className="w-full bg-surface-container text-primary font-label-mono-md text-label-mono-md uppercase px-space-md py-2.5 rounded-lg focus:outline-none focus:bg-surface-container-highest transition-colors"
            />
          </div>
          <div className="flex flex-col gap-space-xs">
            <span className="font-label-ui-md text-label-ui-md text-on-surface font-semibold">
              Lead Coordinator
            </span>
            <div className="flex items-center gap-space-xs px-space-sm py-2 bg-surface-container rounded-lg">
              <UserAvatar size="xs" email={leadEmail} />
              <span className="font-label-ui-md text-label-ui-md text-on-surface truncate">
                {leadEmail ? nameFromEmail(leadEmail) : "You"}
              </span>
            </div>
          </div>
        </div>

        {/* ---- COLOR IDENTITY ---------------------------------- */}
        <div className="flex flex-col gap-space-xs">
          <span className="font-label-ui-md text-label-ui-md text-on-surface font-semibold">
            Color Identity
          </span>
          <div className="flex items-center gap-space-sm pt-1">
            {(
              [
                "primary",
                "tertiary",
                "secondary",
                "error",
                "outline",
              ] as ColorToken[]
            ).map((token) => {
              const active = colorToken === token;
              return (
                <button
                  key={token}
                  type="button"
                  aria-label={`Select ${token} color`}
                  aria-pressed={active}
                  onClick={() => setColorToken(token)}
                  className={[
                    "w-7 h-7 rounded-full flex items-center justify-center transition-all",
                    bgForToken(token),
                    active
                      ? "ring-2 ring-offset-2 ring-offset-surface ring-primary"
                      : "hover:opacity-90",
                  ].join(" ")}
                >
                  {active ? (
                    <Icon
                      name="check"
                      className="w-[14px] h-[14px] text-on-primary"
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* ---- WORKFLOW TEMPLATE PRESET ------------------------ */}
        <div className="flex flex-col gap-space-xs">
          <span className="font-label-ui-md text-label-ui-md text-on-surface font-semibold">
            Workflow Template
          </span>
          <div className="grid grid-cols-1 gap-space-xs pt-1">
            <WorkflowTemplateCard
              id="software-engineering"
              title="Software Engineering (Linear Style)"
              subtitle="Triage, Backlog, In Progress, In Review, Done"
              iconName="developer_board"
              active={workflowTemplate === "software-engineering"}
              onClick={() => setWorkflowTemplate("software-engineering")}
            />
            <WorkflowTemplateCard
              id="incident-management"
              title="Incident Management"
              subtitle="Investigating, Identified, Monitoring, Resolved"
              iconName="bug_report"
              active={workflowTemplate === "incident-management"}
              onClick={() => setWorkflowTemplate("incident-management")}
            />
          </div>
        </div>

        {/* ---- AUTOMATION DEFAULTS ----------------------------- */}
        <div className="flex flex-col gap-space-xs p-space-md rounded-xl bg-surface-container shadow-sm">
          <div className="flex items-center justify-between gap-space-sm">
            <div className="flex flex-col">
              <span className="font-label-ui-md text-label-ui-md text-on-surface font-semibold">
                Auto-archive Closed Issues
              </span>
              <span className="font-label-mono-sm text-label-mono-sm text-outline">
                After 14 days of no activity
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoArchive}
              aria-label="Toggle auto-archive"
              onClick={() => setAutoArchive((v) => !v)}
              className={[
                "w-9 h-5 rounded-full relative p-0.5 transition-colors cursor-pointer shrink-0",
                autoArchive
                  ? "bg-primary"
                  : "bg-surface-container-highest",
              ].join(" ")}
            >
              <div
                className={[
                  "w-4 h-4 rounded-full bg-on-primary shadow-sm transition-all transform",
                  autoArchive ? "ml-auto" : "mr-auto",
                ].join(" ")}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ---- DRAWER FOOTER -------------------------------------- */}
      <div className="p-space-xl bg-surface-container flex items-center justify-between gap-space-sm border-t border-outline-variant/30">
        <button
          type="button"
          onClick={onClose}
          className="px-space-md py-2.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-ui-md text-label-ui-md transition-colors shadow-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!canCreate}
          className="flex-1 py-2.5 rounded-lg bg-primary text-on-primary font-label-ui-md text-label-ui-md hover:bg-primary-fixed-dim transition-colors text-center shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create &amp; Launch Board
        </button>
      </div>
    </aside>
  );
}

/** Card-shaped option in the Workflow Template radio group. */
function WorkflowTemplateCard({
  title,
  subtitle,
  iconName,
  active,
  onClick,
}: {
  id: WorkflowTemplateId;
  title: string;
  subtitle: string;
  iconName: "developer_board" | "bug_report";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="radio"
      aria-checked={active}
      className={[
        "p-space-md rounded-xl flex items-start gap-space-sm text-left cursor-pointer transition-colors",
        active
          ? "bg-surface-container-high"
          : "bg-surface-container hover:bg-surface-container-high",
      ].join(" ")}
    >
      <Icon
        name={iconName}
        className={[
          "w-5 h-5 mt-0.5 shrink-0",
          active ? "text-primary" : "text-outline",
        ].join(" ")}
      />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="font-headline-sm text-headline-sm text-on-surface">
          {title}
        </span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {subtitle}
        </span>
      </div>
      <Icon
        name={active ? "radio_button_checked" : "radio_button_unchecked"}
        className={[
          "w-[18px] h-[18px] ml-auto shrink-0",
          active ? "text-primary" : "text-outline",
        ].join(" ")}
      />
    </button>
  );
}

/** Map a ColorToken to its Tailwind `bg-*` utility (Kinetic Grid
 * semantic tokens already exist in `tokens.css`). */
function bgForToken(token: ColorToken): string {
  switch (token) {
    case "primary":
      return "bg-primary";
    case "tertiary":
      return "bg-tertiary";
    case "secondary":
      return "bg-secondary";
    case "error":
      return "bg-error";
    case "outline":
      return "bg-outline";
  }
}

/** Local copy of the email → name helper used by `ShareBoardModal`
 * — duplicated here to keep the two components self-contained and
 * importable independently. */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const spaced = local.replace(/[._-]+/g, " ").trim();
  return spaced
    .split(/\s+/)
    .map((w) => (w[0] ?? "").toUpperCase() + w.slice(1))
    .join(" ");
}
