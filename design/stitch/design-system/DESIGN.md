---
name: Calm Horizon AI
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002113'
  on-tertiary-container: '#009668'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.005em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.01em
  data-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system targets job seekers, career transitioners, and high-performance professionals preparing for critical career milestones. The emotional response must balance calm reassurance with technological authority: eliminating user anxiety while instilling absolute trust in the AI's diagnostic precision.

The visual direction marries **Corporate Modern** with **Technical Precision Minimalism**:
- **Structured Equilibrium:** Clean architectural grids, measured white space, and purposeful data hierarchy prevent cognitive overload during tense mock interview scenarios.
- **Human-Centric Engineering:** Technical clarity (clear metrics, speech wave monitors, rubric trackers) tempered by soft curves and humanized slate tones.
- **Distraction-Free Focus:** High-contrast typographic cues and subdued secondary elements ensure the candidate focuses entirely on real-time feedback, verbal delivery, and self-evaluation.

## Colors

The palette establishes an atmosphere of objective authority and measured composure:

- **Primary (`#0F172A`, `#1E293B`):** Deep Midnight Slate. Used for primary typography, authoritative structural anchors, focused sidebar headers, and solid primary actions that demand full commitment.
- **Secondary / Accent (`#2563EB`, `#3B82F6`):** Precision Indigo. Reserved for interactive feedback states, active audio/video states, real-time speech indicators, progress gauges, and key CTAs.
- **Tertiary / Success (`#10B981`):** Calibrated Mint Emerald. Indicates positive interview milestones, matched keywords, rubric achievements, and affirmative AI diagnostics.
- **Warning / Alert Accents:** Amber (`#F59E0B`) for speech pacing warnings or filler word frequency, and Crimson (`#EF4444`) for connection warnings or structural response gaps.
- **Backgrounds & Canvases:** Primary canvas utilizes `#F8FAFC`, transitioning to `#F1F5F9` for secondary structural sidebars, audio test panels, and secondary container fills.
- **Surfaces & Borders:** Clean pure white (`#FFFFFF`) cards layered with 1px border lines in `#E2E8F0` prevent visual bleed while maintaining subtle separation without harsh divides.

## Typography

The typography pairings serve dual goals: immediate readability during high-pressure interactions and analytical clarity for analytical reporting.

- **Headlines (`Plus Jakarta Sans` / Pretendard fallback):** Modern geometric grotesk character that provides structural presence without cold sterility. Headings feature subtle negative letter-spacing for tight, confident optical weight.
- **Body Text (`Inter` / Pretendard fallback):** Neutral, utilitarian sans-serif optimized for long-form feedback critique, STAR-method breakdowns, and transcribed interview dialogues.
- **Numerical & Status Indicators (`JetBrains Mono`):** Monospaced precision for time limits, speech tempo counters (WPM), voice pitch variance, filler word frequency, and scoring indices.
- **Line Heights:** Generous line heights are enforced across body copy (`1.6x` to `1.625x`) to ensure rapid scanning of candidate feedback without eye fatigue.

## Layout & Spacing

The layout is anchored in a 12-column fixed-max-width grid (capped at `1440px` on wide displays) to preserve user concentration and prevent peripheral camera misdirection during live video questions.

- **Layout Structure:**
  - **Live Interview Mode:** Centered 2-column or 3-column split view (Candidate Video Feed / AI Questioner & Real-time Transcription / Dynamic Prompt Guide) with a permanent 24px gutter.
  - **Analysis & Review Mode:** Flexible asymmetric dashboard (1/3 summary panel, 2/3 granular timeline analysis and transcription logs).
- **Rhythm & Increments:** Built on a strict 8px/4px base rhythm. Element paddings must map directly to `space-xs` (4px), `space-sm` (8px), `space-md` (16px), `space-lg` (24px), or `space-xl` (32px).
- **Desktop Focus:** Desktop views maintain a minimum 32px (`margin`) edge offset, ensuring browser window edges never crowd live interview recording monitors.

## Elevation & Depth

Visual depth relies on **Tonal Layering** accompanied by **Subtle Ambient Shadows** and **Crisp Micro-Outlines**:

- **Layer 0 (Canvas):** `#F8FAFC` base application background.
- **Layer 1 (Card / Surface):** `#FFFFFF` surfaces with a crisp `1px solid #E2E8F0` border and low-slung ambient shadow (`box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.04), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`).
- **Layer 2 (Interactive Floating Modules / Hovered Cards):** `#FFFFFF` cards elevated to `box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.06), 0 4px 6px -4px rgba(15, 23, 42, 0.04)`, border shifting to `#CBD5E1`.
- **Layer 3 (Modals / Live Session Overlays / Tooltips):** Distinct separation with `box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)` layered over an ambient backdrop dim of `rgba(15, 23, 42, 0.4)`.

No heavy drop-shadows or stark borders are allowed; the interface must feel luminous, steady, and weightless.

## Shapes

The shape hierarchy employs deliberate curvature to soften clinical scrutiny:

- **Base Cards & Video Feed Containers:** Border-radius of `12px` to `16px` (`rounded-lg` to `rounded-xl`). Video feeds must always preserve continuous 16px corner radii to integrate seamlessly into dashboard surfaces.
- **Form Controls & Buttons:** Unified radius of `8px` (`rounded-md`), communicating solid clickable tactility.
- **Badges, Status Chips, & Audio Meters:** Pill-shaped (`rounded-full`), clearly separating analytical metadata and tags from interactive rectilinear surfaces.
- **Borders:** Consistent hairline thickness of `1px` across all nested surfaces to preserve visual discipline.

## Components

### Buttons
- **Primary:** Background `#0F172A`, text `#FFFFFF`, border-radius 8px. Hover state shifts to `#1E293B` with micro-lift (`translateY(-1px)`). Focus state ring: 2px offset with `#2563EB`.
- **Secondary / Action:** Background `#2563EB`, text `#FFFFFF`. Hover state `#1D4ED8`. Used exclusively for critical test progression (e.g., "Start Interview", "Submit Answer").
- **Ghost / Outline:** Background transparent, 1px border `#E2E8F0`, text `#1E293B`. Hover state fills with `#F1F5F9`.

### Input Fields & Selectors
- Background `#FFFFFF`, 1px border `#E2E8F0`, 8px radius, padding 10px 14px.
- Focus state: border `#2563EB`, outer glow box-shadow `0 0 0 3px rgba(37, 99, 235, 0.12)`.
- Helper labels utilize `label-md` in `#64748B`.

### Cards & Evaluation Containers
- Standard surface `#FFFFFF`, 1px border `#E2E8F0`, 16px border-radius, 24px internal padding.
- Internal structural divisions use horizontal dividers in `1px solid #F1F5F9`.

### Chips & Metadata Badges
- **Status (Neutral):** Background `#F1F5F9`, text `#475569`, border `#E2E8F0`, pill-radius, typography `label-md`.
- **Positive (AI Verified):** Background `#ECFDF5`, text `#065F46`, border `#A7F3D0`.
- **Notice / Pacing:** Background `#FEF3C7`, text `#92400E`, border `#FDE68A`.

### Lists & Transcription Logs
- Alternating subtle highlight (`#F8FAFC`) on focused question segments.
- Left-hand accent indicator: 3px solid `#2563EB` marking the active speech timestamp.
- Speaker labels: Monospace timestamp badge paired with bold author designation.

### Domain-Specific Components
- **Audio Waveform Visualizer:** 32 vertical bars with dynamic heights, default state `#CBD5E1`, dynamic active state gradient from `#2563EB` to `#3B82F6`.
- **Competency Radar / Progress Bar:** Track background `#E2E8F0`, filled bar `#2563EB` with `rounded-full` caps, numerical score anchored in `data-mono`.
- **Interview Timer:** Monospaced clock capsule with a pulsating 6px status dot (Emerald `#10B981` during recording, Slate `#64748B` during pause).