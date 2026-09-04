---
name: Kinetic Grid
colors:
  surface: "#0b1326"
  surface-dim: "#0b1326"
  surface-bright: "#31394d"
  surface-container-lowest: "#060e20"
  surface-container-low: "#131b2e"
  surface-container: "#171f33"
  surface-container-high: "#222a3d"
  surface-container-highest: "#2d3449"
  on-surface: "#dae2fd"
  on-surface-variant: "#c7c4d7"
  inverse-surface: "#dae2fd"
  inverse-on-surface: "#283044"
  outline: "#908fa0"
  outline-variant: "#464554"
  surface-tint: "#c0c1ff"
  primary: "#c0c1ff"
  on-primary: "#1000a9"
  primary-container: "#8083ff"
  on-primary-container: "#0d0096"
  inverse-primary: "#494bd6"
  secondary: "#d0bcff"
  on-secondary: "#3c0091"
  secondary-container: "#571bc1"
  on-secondary-container: "#c4abff"
  tertiary: "#4cd7f6"
  on-tertiary: "#003640"
  tertiary-container: "#009eb9"
  on-tertiary-container: "#002f38"
  error: "#ffb4ab"
  on-error: "#690005"
  error-container: "#93000a"
  on-error-container: "#ffdad6"
  primary-fixed: "#e1e0ff"
  primary-fixed-dim: "#c0c1ff"
  on-primary-fixed: "#07006c"
  on-primary-fixed-variant: "#2f2ebe"
  secondary-fixed: "#e9ddff"
  secondary-fixed-dim: "#d0bcff"
  on-secondary-fixed: "#23005c"
  on-secondary-fixed-variant: "#5516be"
  tertiary-fixed: "#acedff"
  tertiary-fixed-dim: "#4cd7f6"
  on-tertiary-fixed: "#001f26"
  on-tertiary-fixed-variant: "#004e5c"
  background: "#0b1326"
  on-background: "#dae2fd"
  surface-variant: "#2d3449"
typography:
  display-xl:
    fontFamily: geist
    fontSize: 36px
    fontWeight: "600"
    lineHeight: 44px
    letterSpacing: -0.03em
  display-xl-mobile:
    fontFamily: geist
    fontSize: 28px
    fontWeight: "600"
    lineHeight: 36px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: geist
    fontSize: 24px
    fontWeight: "600"
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: geist
    fontSize: 18px
    fontWeight: "600"
    lineHeight: 26px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: geist
    fontSize: 15px
    fontWeight: "600"
    lineHeight: 22px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: geist
    fontSize: 15px
    fontWeight: "400"
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: geist
    fontSize: 13px
    fontWeight: "400"
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: geist
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 18px
    letterSpacing: 0.005em
  label-mono-md:
    fontFamily: jetbrainsMono
    fontSize: 12px
    fontWeight: "500"
    lineHeight: 16px
    letterSpacing: -0.01em
  label-mono-sm:
    fontFamily: jetbrainsMono
    fontSize: 11px
    fontWeight: "500"
    lineHeight: 14px
    letterSpacing: 0em
  label-ui-md:
    fontFamily: geist
    fontSize: 12px
    fontWeight: "500"
    lineHeight: 16px
    letterSpacing: 0.01em
  label-ui-sm:
    fontFamily: geist
    fontSize: 11px
    fontWeight: "500"
    lineHeight: 14px
    letterSpacing: 0.015em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-base: 1rem
  space-lg: 1.25rem
  space-xl: 1.5rem
  space-2xl: 2rem
  space-3xl: 3rem
  column-width-min: 18rem
  column-width-max: 22rem
  gutter-board: 0.875rem
  sidebar-collapsed: 3.5rem
  sidebar-expanded: 15rem
---

## Brand & Style

The design system embodies the focus, precision, and velocity required by modern high-performing product engineering and cross-functional design teams. It combines the structured density of enterprise-grade issue tracking with the bespoke craft, tactile depth, and typography-first clarity of high-end developer tooling.

The visual style is **Linear-modern minimalism** paired with architectural micro-surfaces:

- **Calm, High-Information Density:** Minimal visual noise allows work items, priorities, and workflow states to command immediate comprehension.
- **Instrument-Grade Craft:** Precision hairline borders, calibrated optical contrast, monospaced micro-metadata, and subtle ambient glows.
- **Atmospheric Depth:** Multi-tiered layered slate surfaces provide tactile separation without relying on heavy or muddy drop shadows.
- **Tactile Responsiveness:** Subtle state transitions (sub-150ms cubic-bezier easings), precise keyboard-first navigation cues, and clear drag-and-drop affordances.

## Colors

The palette is engineered specifically for prolonged, immersive focus with deep slate grounds and high-contrast, luminous semantic accents.

### Ground & Surfaces

- **Canvas Base (`#0B0F19`):** Root viewport canvas behind board columns.
- **Surface Level 1 (`#111827`):** Board swimlanes, sidebars, and grouped content containers.
- **Surface Level 2 (`#1E293B`):** Individual Kanban cards, popover panels, command menus, and table headers.
- **Surface Level 3 (`#334155`):** Hover states, nested pill containers, active filters, and transient drag avatars.

### Accent & Identity

- **Primary Indigo (`#6366F1`):** Active interaction targets, primary actions, selected indicators, keyboard focus rings, and link accents.
- **Secondary Violet (`#8B5CF6`):** Secondary interactive triggers, multi-select ranges, and ambient highlight accents.
- **Tertiary Cyan (`#06B6D4`):** Automation triggers, live presence markers, and telemetry tags.

### Semantic Workflow Status Tokens

- **Backlog (`#64748B`):** Muted slate for deprioritized or exploratory items.
- **To-Do (`#818CF8`):** Crisp soft indigo signaling ready-to-execute status.
- **In-Progress (`#F59E0B`):** High-visibility amber signaling active ownership and cycle consumption.
- **Review / QA (`#A855F7`):** Electric purple for peer validation.
- **Done (`#10B981`):** Clear emerald signaling resolution and milestone closure.
- **Blocked / Critical (`#EF4444`):** Pure coral-red for blockers and P0 incidents.

### Borders & Dividing Strokes

- **Border Subtle (`rgba(255, 255, 255, 0.07)`):** Default card separation and column outlines.
- **Border Default (`rgba(255, 255, 255, 0.12)`):** Hovered cards, standard input fields, modal wrappers.
- **Border Strong (`rgba(255, 255, 255, 0.20)`):** Focused containers, active column drag targets.

## Typography

The type system prioritizes micro-legibility and tabular alignment:

- **Primary Typeface (Geist):** Clean geometric terminals, a tall x-height, and neutral neutral proportions engineered for software dashboards and editorial density.
- **Monospace Typeface (JetBrains Mono):** Applied strictly to functional task identifiers (`ENG-1284`), git branches, shortcuts (`⌘K`), estimation points, and timestamps.
- **Optical Weight Hierarchy:** Headlines utilize medium and semi-bold weights with negative tracking to maintain crisp edge definition on subpixel displays. Body copy is optimized at 13px/20px to permit comfortable multi-card scanning without vertical fatigue.

## Layout & Spacing

The layout is built on a strict 4px base increment designed around an asynchronous horizontal Kanban canvas and contextual drawer system.

### Board Layout Mechanics

- **Horizontal Kanban Board:** Columns have a fixed minimum width of `18rem` (`288px`) and a maximum fluid width of `22rem` (`352px`). On wide desktop displays, columns fill remaining viewport width evenly or preserve column width with horizontal inertia scrolling.
- **Gutters & Spacing Rhythm:** Columns are separated by `gutter-board` (`0.875rem` / `14px`). Cards inside a lane maintain `space-sm` (`8px`) vertical gaps to balance compact grouping with clear interactive hit boundaries.
- **Responsive Adaptive Behavior:**
  - **Desktop (≥ 1280px):** Full multi-column view (4-6 lanes visible simultaneously), persistent collapsible navigation sidebar, top filtering bar.
  - **Tablet (768px – 1279px):** Horizontal swipeable canvas with 2.5 columns visible at any given time; sidebar converts to an off-canvas drawer.
  - **Mobile (< 768px):** Single-column stacked mode with segmented controls or a swipeable lane tab system to jump directly between statuses without disorienting cross-axis scrolling.

## Elevation & Depth

Visual hierarchy is communicated through a hybrid strategy of **tonal surface stacking**, **hairline edge illumination**, and **restrained directional micro-shadows**:

- **Layer 0 (Canvas):** Pure `#0B0F19`. Zero shadow.
- **Layer 1 (Lanes & Sidebars):** `#111827` background with a `1px` border of `rgba(255, 255, 255, 0.05)`.
- **Layer 2 (Resting Cards):** `#1E293B` background, `1px solid rgba(255, 255, 255, 0.08)`, and a subtle micro-shadow: `0 1px 2px rgba(0, 0, 0, 0.4)`.
- **Layer 3 (Hovered Card):** Background shifts subtly to `#24334A`, border brightens to `rgba(255, 255, 255, 0.16)`, shadow elevates to: `0 4px 12px rgba(0, 0, 0, 0.35), 0 1px 2px rgba(0, 0, 0, 0.2)`.
- **Layer 4 (Active Dragging Card):** Card rotates 1.5 degrees, opacity stays at 100%, background elevates to `#2A3A52`, border tints to `rgba(99, 102, 241, 0.5)` with an outer glow: `0 12px 28px -4px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(99, 102, 241, 0.4)`.
- **Layer 5 (Modals & Command Palettes):** `#1E293B` shell supported by backdrop blur (`backdrop-filter: blur(12px)` over `rgba(5, 8, 15, 0.7)`), bounded by `1px solid rgba(255, 255, 255, 0.15)`, and shadowed by `0 24px 48px -8px rgba(0, 0, 0, 0.7)`.

## Shapes

The design system implements a refined **Soft (Level 1)** geometric standard. This conveys clean architectural discipline without feeling harsh or clinical:

- **Tags, Chips, and Badges:** `4px` (`0.25rem`) corner radius. Maintains crisp compactness alongside monospace identifiers.
- **Buttons and Inputs:** `6px` (`0.375rem`) corner radius. Balances tactile clickability with tight row alignments.
- **Cards and Popovers:** `8px` (`0.5rem`) corner radius (`rounded-lg`). Creates cohesive container blocks that group internal elements smoothly.
- **Modals and Command Panels:** `12px` (`0.75rem`) corner radius (`rounded-xl`). Frames focal operations with distinct presence.
- **Avatars:** Fully circular (`rounded-full`) to contrast immediately against structural rectangular cards.

## Components

### Buttons

- **Primary:** Background `var(--primary-color-hex)` (`#6366F1`), text `#FFFFFF`, border `1px solid rgba(255, 255, 255, 0.2)`, inner highlight shadow `inset 0 1px 0 rgba(255, 255, 255, 0.2)`. Hover background `#4F46E5`.
- **Secondary / Ghost:** Background `rgba(255, 255, 255, 0.04)`, text `#E2E8F0`, border `1px solid rgba(255, 255, 255, 0.08)`. Hover background `rgba(255, 255, 255, 0.08)` and border `rgba(255, 255, 255, 0.15)`.
- **Icon Actions:** `28px x 28px` square tap targets with `6px` radius, housing `14px` icons with `#94A3B8` fill, transitioning to `#F8FAFC` on hover.

### Badges & Tag Chips

- **Status Badges:** `h-5`, padding `0 6px`, font `label-ui-sm`. Incorporates a `6px` solid status circle indicator on the left. Subtle tinted background at 12% opacity matching the semantic token, paired with a matching 25% opaque border.
- **Monospace Task Identifiers (e.g., `CORE-82`):** Background `rgba(255, 255, 255, 0.05)`, text `#94A3B8`, hover text `#E2E8F0`, border `1px solid rgba(255, 255, 255, 0.08)`.
- **Priority Indicator:** Icon-driven glyphs (P0 Urgency red flame/chevron, P1 Orange triple-bar, P2 Blue double-bar, P3 Slate single-bar) with matching micro-tooltips.

### Kanban Cards

- **Structure:** Padding `12px 14px`. Header contains task identifier and assignee avatar stack; body holds title (`headline-sm`, 2-line clamp max); footer features status tag, priority indicator, subtask count (`2/5`), and attachment markers.
- **Interaction:** Smooth scale transition (`scale(1.01)`) and border illumination upon hover. Card selection draws a continuous `2px` left border in `primary_color_hex`.

### Input Fields & Search

- **Default State:** Background `rgba(15, 23, 42, 0.6)`, text `#F8FAFC`, placeholder `#64748B`, border `1px solid rgba(255, 255, 255, 0.1)`.
- **Focused State:** Background `#0F172A`, border `1px solid #6366F1`, ring `0 0 0 2px rgba(99, 102, 241, 0.25)`.
- **Quick-Filter Command Bar:** Integrated shortcut badge (`⌘K`) right-aligned, monospaced hint label.

### Checkboxes & Selection Controls

- **Checkboxes:** `16px x 16px` with `4px` radius. Resting state: border `1px solid rgba(255, 255, 255, 0.2)`, background `rgba(255, 255, 255, 0.03)`. Checked state: background `#6366F1`, border `#6366F1`, sharp check icon in `#FFFFFF`.

### Modal Overlays & Drawers

- **Issue Detail Panel:** Slide-over modal docked to the right edge (`640px` width) for contextual inspection without losing board coordinates. Dark slate surface (`#1E293B`) with left border `1px solid rgba(255, 255, 255, 0.12)`.
- **Header Action Bar:** Sticky breadcrumb header with real-time sync pulse, share action, and close icon (`Esc`).
