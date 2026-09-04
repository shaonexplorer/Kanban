"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./useAuth";
import { fetchMyBoards } from "@/features/board/api";
import { Icon } from "@/features/board/components/Icon";

/**
 * Real auth UI (Phase 5).
 *
 * The layout is a faithful port of the Kandor Stitch screen at
 * `.stitch-cache/auth.html`:
 *
 *   ┌─ brand pitch (5/12) ─┬─ form (7/12) ─┐
 *   │ gradient orbs        │ tab switcher  │
 *   │ brand mark           │ title         │
 *   │ v3.4 chip            │ SSO (disabled)│
 *   │ headline + body      │ divider       │
 *   │ 3 feature points     │ form          │
 *   │ mini board mockup    │ security badge│
 *   │ tech-stack chips     │ mode switch   │
 *   └──────────────────────┴───────────────┘
 *
 * Every class is mapped verbatim onto the Kinetic Grid tokens in
 * `src/design/tokens.css` — no new colors, no new font sizes, no new
 * spacing values. The icons are inline SVGs from
 * `@/features/board/components/Icon` (no Material Symbols font).
 *
 * Wiring:
 *   - Sign In   → `loginWithEmail(email, password)` (Phase 5)
 *   - Register  → `registerWithEmail(email, password)` (Phase 4)
 *   - Success   → `router.push("/boards/<first-board-id>")`
 *   - Errors    → a `role="alert"` paragraph under the submit button
 *
 * Out of scope (documented in
 * `C:\Users\shaon\.claude\plans\scalable-strolling-wigderson.md`
 * §"Out of scope"):
 *   - Real SSO (GitHub/Google buttons are disabled).
 *   - Sending `fullName` to the server (server schema is
 *     `{ email, password }` only).
 *   - Forgot-password flow (the link is rendered but inert).
 *   - Honoring the "Remember hardware session for 30 days" checkbox
 *     until the server's JWT `expiresIn` accepts a client TTL.
 */

type AuthMode = "signin" | "register";

export function AuthScreen() {
  const router = useRouter();
  const { registerWithEmail, loginWithEmail } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Submit handler. Mirrors the Stitch HTML's `<form onsubmit="event.preventDefault()">`
   * — the form is purely presentational until a real backend is
   * called. The two tabs fan out to the matching `AuthContext` helper.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        // The Stitch screen captures `fullName` for display, but the
        // Phase 1 server schema only accepts `{ email, password }`.
        // The field stays in the UI for visual parity with the design.
        await registerWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
      await routeToFirstBoard();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function routeToFirstBoard() {
    try {
      const boards = await fetchMyBoards();
      if (boards.length === 0) {
        // Mirror the dev-mode home-page behaviour: surface a
        // "no boards yet" status rather than routing to an empty
        // board view. The user can either create a board via the
        // API or sign out and re-register.
        setError(
          mode === "register"
            ? "Account created, but no boards exist yet. Create one via the API and reload."
            : "Signed in, but no boards exist yet. Create one via the API and reload.",
        );
        return;
      }
      router.push(`/boards/${boards[0].id}`);
    } catch (err) {
      setError(`Couldn't load boards: ${describeError(err)}`);
    }
  }

  function swapMode() {
    setMode((m) => (m === "signin" ? "register" : "signin"));
  }

  return (
    <main className="w-full min-h-screen flex items-center justify-center p-space-xl bg-surface">
      <div className="flex flex-col w-full max-w-7xl mx-auto my-auto shadow-2xl rounded-xl overflow-hidden bg-surface-container-lowest">
        <div className="grid grid-cols-1 lg:grid-cols-12 w-full min-h-[760px]">
          <BrandPanel />
          <div className="lg:col-span-7 flex flex-col justify-center p-space-2xl bg-surface-container">
            <div className="max-w-md w-full mx-auto space-y-space-lg">
              <TabSwitcher mode={mode} onModeChange={setMode} />
              <TitleBlock mode={mode} />
              <SSOButtons />
              <Divider />
              <form
                className="space-y-space-md"
                onSubmit={handleSubmit}
                noValidate
              >
                <FullNameField
                  visible={mode === "register"}
                  value={fullName}
                  onChange={setFullName}
                />
                <EmailField
                  value={email}
                  onChange={setEmail}
                  disabled={submitting}
                />
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggleShow={() => setShowPassword((s) => !s)}
                  disabled={submitting}
                />
                <RememberRow
                  remember={remember}
                  onRememberChange={setRemember}
                  showForgot={mode === "signin"}
                />
                <SubmitButton
                  mode={mode}
                  submitting={submitting}
                  disabled={!email || !password}
                />
              </form>
              <SecurityBadge />
              <ModeSwitchFooter mode={mode} onSwap={swapMode} />
              {error ? (
                <p
                  role="alert"
                  className="font-body-sm text-body-sm text-error"
                >
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------- *
 *  Left brand panel
 * -------------------------------------------------------------------- */

function BrandPanel() {
  return (
    <aside className="lg:col-span-5 relative flex flex-col justify-between p-space-2xl bg-surface-container-low overflow-hidden">
      {/* Radial glow orbs (contained within the left side). */}
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-secondary-container opacity-40 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-24 w-96 h-96 rounded-full bg-primary-container opacity-20 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-tertiary-container opacity-25 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col space-y-space-xl">
        <BrandMark />
        <Headline />
        <FeaturePoints />
      </div>

      <div className="relative z-10 my-space-lg">
        <MiniBoardMockup />
      </div>

      <div className="relative z-10 pt-space-sm">
        <TechStackChips />
      </div>
    </aside>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center space-x-space-sm">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-secondary-container via-primary-container to-tertiary flex items-center justify-center shadow-md">
        <Icon
          name="view_kanban"
          className="text-surface font-semibold w-6 h-6"
        />
      </div>
      <div className="flex flex-col">
        <span className="font-headline-md text-headline-md tracking-tight text-on-surface">
          Kandor
        </span>
        <span className="font-label-mono-sm text-label-mono-sm text-secondary uppercase tracking-widest -mt-1">
          Workspace OS
        </span>
      </div>
    </div>
  );
}

function Headline() {
  return (
    <div className="space-y-space-sm">
      <div className="inline-flex items-center space-x-space-xs px-space-sm py-space-2xs rounded-full bg-surface-container-high text-tertiary font-label-mono-sm text-label-mono-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
        <span>v3.4 Production Ready</span>
      </div>
      <h1 className="font-headline-lg text-headline-lg text-on-surface leading-tight">
        Engineered for velocity. Real-time collaborative task architecture.
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant">
        A high-throughput project engine built for asynchronous engineering
        teams who ship continuously without sync friction.
      </p>
    </div>
  );
}

function FeaturePoints() {
  const items: Array<{
    icon: "swap_vert" | "sensors" | "verified_user";
    accent: "primary" | "tertiary" | "secondary";
    title: string;
    body: string;
  }> = [
    {
      icon: "swap_vert",
      accent: "primary",
      title: "Zero lock contention drag & drop",
      body: "Lexicographical fractional indices ensure concurrent reorders resolve smoothly.",
    },
    {
      icon: "sensors",
      accent: "tertiary",
      title: "Live multi-user presence & WebSockets",
      body: "Sub-40ms operational broadcast for cursor streams, field locks, and card mutations.",
    },
    {
      icon: "verified_user",
      accent: "secondary",
      title: "End-to-end relational type safety",
      body: "Strict contract alignment from PostgreSQL Prisma models directly to reactive UI state.",
    },
  ];
  const accentText: Record<(typeof items)[number]["accent"], string> = {
    primary: "text-primary",
    tertiary: "text-tertiary",
    secondary: "text-secondary",
  };
  return (
    <div className="space-y-space-md pt-space-xs">
      {items.map((item) => (
        <div key={item.title} className="flex items-start space-x-space-md">
          <div
            className={`w-7 h-7 rounded-lg bg-surface-container-highest flex items-center justify-center ${accentText[item.accent]} mt-0.5 shadow-sm`}
          >
            <Icon name={item.icon} className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-headline-sm text-headline-sm text-on-surface">
              {item.title}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {item.body}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniBoardMockup() {
  return (
    <div className="bg-surface-container-high/90 backdrop-blur-md rounded-xl p-space-md shadow-2xl transform -rotate-1 hover:rotate-0 transition-transform duration-300">
      <div className="flex items-center justify-between pb-space-sm mb-space-sm">
        <div className="flex items-center space-x-space-xs">
          <span className="w-2 h-2 rounded-full bg-tertiary" />
          <span className="font-label-mono-sm text-label-mono-sm text-on-surface">
            SPRINT-38 // REALTIME SYNC
          </span>
        </div>
        <span className="font-label-mono-sm text-label-mono-sm text-outline">
          98.4% uptime
        </span>
      </div>
      <div className="grid grid-cols-2 gap-space-sm">
        <MockColumn
          title="In Flight"
          count={3}
          pillClass="text-primary"
          cardId="KND-291"
          cardIcon="local_fire_department"
          cardIconClass="text-error"
          cardTitle="Wire WebSocket Redis Adapter"
          meta="4/6 subtasks"
          avatarBg="bg-secondary-container"
          avatarText="text-on-secondary-container"
          avatarInitial="AC"
        />
        <MockColumn
          title="Peer Review"
          count={1}
          pillClass="text-tertiary"
          cardId="KND-288"
          cardIcon="tune"
          cardIconClass="text-primary"
          cardTitle="Optimistic Lane Reindexing"
          meta="Ready"
          avatarBg="bg-tertiary-container"
          avatarText="text-on-tertiary-container"
          avatarInitial="ML"
        />
      </div>
    </div>
  );
}

function MockColumn({
  title,
  count,
  pillClass,
  cardId,
  cardIcon,
  cardIconClass,
  cardTitle,
  meta,
  avatarBg,
  avatarText,
  avatarInitial,
}: {
  title: string;
  count: number;
  pillClass: string;
  cardId: string;
  cardIcon: "local_fire_department" | "tune";
  cardIconClass: string;
  cardTitle: string;
  meta: string;
  avatarBg: string;
  avatarText: string;
  avatarInitial: string;
}) {
  return (
    <div className="bg-surface-container rounded-lg p-space-xs flex flex-col space-y-space-xs">
      <div className="flex items-center justify-between px-space-2xs">
        <span className="font-label-ui-sm text-label-ui-sm text-on-surface-variant">
          {title}
        </span>
        <span
          className={`font-label-mono-sm text-label-mono-sm px-1.5 py-0.5 rounded bg-surface-container-highest ${pillClass}`}
        >
          {count}
        </span>
      </div>
      <div className="bg-surface-container-highest p-space-xs rounded shadow-sm flex flex-col space-y-space-2xs">
        <div className="flex items-center justify-between">
          <span className="font-label-mono-sm text-label-mono-sm text-secondary">
            {cardId}
          </span>
          <Icon name={cardIcon} className={`${cardIconClass} w-4 h-4`} />
        </div>
        <p className="font-headline-sm text-headline-sm text-on-surface text-xs line-clamp-1">
          {cardTitle}
        </p>
        <div className="flex items-center justify-between pt-1">
          <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">
            {meta}
          </span>
          <div
            className={`w-4 h-4 rounded-full ${avatarBg} ${avatarText} flex items-center justify-center font-label-mono-sm text-[9px]`}
          >
            {avatarInitial}
          </div>
        </div>
      </div>
    </div>
  );
}

function TechStackChips() {
  const chips = [
    { label: "Next.js 14", accent: false },
    { label: "NestJS", accent: false },
    { label: "Prisma ORM", accent: false },
    { label: "PostgreSQL", accent: false },
    { label: "Redis Pub/Sub", accent: true },
  ];
  return (
    <div>
      <p className="font-label-mono-sm text-label-mono-sm text-outline uppercase tracking-wider mb-space-xs">
        Ecosystem Engine
      </p>
      <div className="flex flex-wrap gap-space-xs">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className={[
              "px-space-sm py-0.5 rounded-full",
              "bg-surface-container-highest",
              "font-label-mono-sm text-label-mono-sm",
              chip.accent ? "text-tertiary" : "text-on-surface-variant",
            ].join(" ")}
          >
            {chip.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- *
 *  Right form panel
 * -------------------------------------------------------------------- */

function TabSwitcher({
  mode,
  onModeChange,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
}) {
  const base =
    "flex-1 py-space-xs rounded-lg font-label-ui-md text-label-ui-md transition-all flex items-center justify-center space-x-1.5";
  const active = "text-on-surface bg-surface-container-high shadow-sm";
  const inactive = "text-outline hover:text-on-surface";
  return (
    <div
      role="tablist"
      aria-label="Authentication mode"
      className="flex p-space-2xs rounded-xl bg-surface-container-lowest"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "signin"}
        onClick={() => onModeChange("signin")}
        className={`${base} ${mode === "signin" ? active : inactive}`}
      >
        <Icon name="login" className="w-4 h-4" />
        <span>Sign In</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "register"}
        onClick={() => onModeChange("register")}
        className={`${base} ${mode === "register" ? active : inactive}`}
      >
        <Icon name="person_add" className="w-4 h-4" />
        <span>Create Account</span>
      </button>
    </div>
  );
}

function TitleBlock({ mode }: { mode: AuthMode }) {
  const title =
    mode === "signin"
      ? "Welcome back to your workspace"
      : "Spin up your team workspace";
  const subtitle =
    mode === "signin"
      ? "Sign in to access your boards, active sprints, and assigned tasks."
      : "Deploy a zero-latency board with live WebSockets sync in 60 seconds.";
  return (
    <div className="space-y-space-2xs">
      <h2 className="font-headline-lg text-headline-lg text-on-surface">
        {title}
      </h2>
      <p className="font-body-md text-body-md text-on-surface-variant">
        {subtitle}
      </p>
    </div>
  );
}

function SSOButtons() {
  return (
    <div className="grid grid-cols-2 gap-space-sm">
      <SSOButton provider="github" label="GitHub" />
      <SSOButton provider="google" label="Google" />
    </div>
  );
}

function SSOButton({
  provider,
  label,
}: {
  provider: "github" | "google";
  label: string;
}) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={`${label} sign-in is coming in a later phase`}
      className="flex items-center justify-center space-x-space-xs py-space-sm px-space-md rounded-xl bg-surface-container-high text-on-surface font-label-ui-md text-label-ui-md shadow-sm opacity-60 cursor-not-allowed"
    >
      {provider === "github" ? (
        <svg
          aria-hidden="true"
          className="w-4 h-4 fill-current"
          viewBox="0 0 24 24"
        >
          <path
            clipRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            fillRule="evenodd"
          />
        </svg>
      ) : (
        <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24">
          <path
            d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
            fill="#EA4335"
          />
          <path
            d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
            fill="#4285F4"
          />
          <path
            d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8 0-1.3.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
            fill="#FBBC05"
          />
          <path
            d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16C3.7 20.4 7.5 23 12 23z"
            fill="#34A853"
          />
        </svg>
      )}
      <span>{label}</span>
    </button>
  );
}

function Divider() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="w-full h-px bg-surface-container-highest" />
      <span className="absolute px-space-sm bg-surface-container font-label-mono-sm text-label-mono-sm text-outline">
        or continue with token / email
      </span>
    </div>
  );
}

function FullNameField({
  visible,
  value,
  onChange,
}: {
  visible: boolean;
  value: string;
  onChange: (next: string) => void;
}) {
  if (!visible) return null;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor="auth-fullname"
        className="block font-label-ui-md text-label-ui-md text-on-surface-variant"
      >
        Full Legal Name
      </label>
      <div className="relative flex items-center">
        <Icon
          name="badge"
          className="absolute left-3 text-outline w-4 h-4 pointer-events-none"
        />
        <input
          id="auth-fullname"
          name="fullName"
          type="text"
          autoComplete="name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Alex Chen"
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary transition-all"
        />
      </div>
    </div>
  );
}

function EmailField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor="auth-email"
          className="block font-label-ui-md text-label-ui-md text-on-surface-variant"
        >
          Work Email
        </label>
        <span className="font-label-mono-sm text-label-mono-sm text-outline">
          SSO ready
        </span>
      </div>
      <div className="relative flex items-center">
        <Icon
          name="mail"
          className="absolute left-3 text-outline w-4 h-4 pointer-events-none"
        />
        <input
          id="auth-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="alex.chen@acme.dev"
          disabled={disabled}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary transition-all disabled:opacity-60"
        />
      </div>
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  show,
  onToggleShow,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  show: boolean;
  onToggleShow: () => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor="auth-password"
          className="block font-label-ui-md text-label-ui-md text-on-surface-variant"
        >
          Master Password
        </label>
        <button
          type="button"
          onClick={(e) => e.preventDefault()}
          title="Forgot password is coming in a later phase"
          className="font-label-ui-sm text-label-ui-sm text-primary hover:text-primary-fixed transition-colors"
        >
          Forgot password?
        </button>
      </div>
      <div className="relative flex items-center">
        <Icon
          name="lock"
          className="absolute left-3 text-outline w-4 h-4 pointer-events-none"
        />
        <input
          id="auth-password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete={show ? "off" : "current-password"}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter secure key"
          disabled={disabled}
          className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary transition-all disabled:opacity-60"
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onToggleShow();
          }}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute right-3 text-outline hover:text-on-surface transition-colors p-1"
        >
          <Icon
            name={show ? "visibility_off" : "visibility"}
            className="w-5 h-5"
          />
        </button>
      </div>
    </div>
  );
}

function RememberRow({
  remember,
  onRememberChange,
  showForgot,
}: {
  remember: boolean;
  onRememberChange: (next: boolean) => void;
  showForgot: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-1">
      <label className="flex items-center space-x-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => onRememberChange(e.target.checked)}
          className="w-4 h-4 rounded bg-surface-container-high text-primary focus:ring-0 focus:outline-none accent-primary cursor-pointer"
        />
        <span className="font-label-ui-sm text-label-ui-sm text-on-surface-variant">
          Remember hardware session for 30 days
        </span>
      </label>
      {showForgot ? (
        <div className="flex items-center space-x-1 text-tertiary font-label-mono-sm text-label-mono-sm">
          <Icon name="vpn_key" className="w-4 h-4" />
          <span>WebAuthn OK</span>
        </div>
      ) : null}
    </div>
  );
}

function SubmitButton({
  mode,
  submitting,
  disabled,
}: {
  mode: AuthMode;
  submitting: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={submitting || disabled}
      className="w-full py-3 px-space-md rounded-xl bg-primary hover:bg-primary-fixed text-on-primary font-headline-sm text-headline-sm flex items-center justify-center space-x-2 transition-all shadow-lg active:scale-[0.99] mt-space-sm disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <span>
        {submitting
          ? mode === "signin"
            ? "Signing in…"
            : "Creating account…"
          : mode === "signin"
            ? "Sign In to Kandor"
            : "Create Workspace Account"}
      </span>
      <Icon name="arrow_forward" className="w-4 h-4" />
    </button>
  );
}

function SecurityBadge() {
  return (
    <div className="p-space-sm rounded-lg bg-surface-container-low flex items-start space-x-space-sm">
      <Icon name="security" className="w-4 h-4 text-secondary" />
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Protected by JWT bearer tokens with rotating refresh keys &amp;
        role-based access control (RBAC). Session events audited.
      </p>
    </div>
  );
}

function ModeSwitchFooter({
  mode,
  onSwap,
}: {
  mode: AuthMode;
  onSwap: () => void;
}) {
  const prompt =
    mode === "signin" ? "Don't have an account?" : "Already have credentials?";
  const cta =
    mode === "signin"
      ? "Create an account (Free 14-day team trial)"
      : "Sign in to existing workspace";
  return (
    <div className="text-center pt-space-xs">
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        <span>{prompt}</span>
        <button
          type="button"
          onClick={onSwap}
          className="ml-1 text-primary hover:text-primary-fixed font-headline-sm text-headline-sm underline underline-offset-4 decoration-primary/40 hover:decoration-primary transition-colors"
        >
          {cta}
        </button>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------- *
 *  Helpers
 * -------------------------------------------------------------------- */

function describeError(err: unknown): string {
  if (err && typeof err === "object" && "isAxiosError" in err) {
    // axios surfaces the server's error body as `err.response.data` —
    // best-effort extraction so the user sees the real reason.
    const ax = err as {
      response?: { data?: { message?: unknown; error?: unknown } };
      message?: string;
    };
    const fromBody = ax.response?.data?.message ?? ax.response?.data?.error;
    if (typeof fromBody === "string") return fromBody;
    if (ax.message) return ax.message;
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}
