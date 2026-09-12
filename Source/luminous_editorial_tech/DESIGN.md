---
name: Luminous Editorial Tech
colors:
  surface: '#f8f9ff'
  surface-dim: '#d8dadf'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3f9'
  surface-container: '#eceef3'
  surface-container-high: '#e6e8ee'
  surface-container-highest: '#e1e2e8'
  on-surface: '#191c20'
  on-surface-variant: '#444653'
  inverse-surface: '#2e3135'
  inverse-on-surface: '#eff0f6'
  outline: '#757684'
  outline-variant: '#c4c5d5'
  surface-tint: '#3755c3'
  primary: '#00288e'
  on-primary: '#ffffff'
  primary-container: '#1e40af'
  on-primary-container: '#a8b8ff'
  inverse-primary: '#b8c4ff'
  secondary: '#b90538'
  on-secondary: '#ffffff'
  secondary-container: '#dc2c4f'
  on-secondary-container: '#fffbff'
  tertiary: '#003c36'
  on-tertiary: '#ffffff'
  tertiary-container: '#00554e'
  on-tertiary-container: '#5fcdbf'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c4ff'
  on-primary-fixed: '#001453'
  on-primary-fixed-variant: '#173bab'
  secondary-fixed: '#ffdadb'
  secondary-fixed-dim: '#ffb2b7'
  on-secondary-fixed: '#40000d'
  on-secondary-fixed-variant: '#92002a'
  tertiary-fixed: '#89f5e7'
  tertiary-fixed-dim: '#6bd8cb'
  on-tertiary-fixed: '#00201d'
  on-tertiary-fixed-variant: '#005049'
  background: '#f8f9ff'
  on-background: '#191c20'
  surface-variant: '#e1e2e8'
typography:
  display-xl:
    fontFamily: Space Grotesk
    fontSize: 64px
    fontWeight: '600'
    lineHeight: 72px
    letterSpacing: -0.03em
  display-xl-mobile:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 44px
    fontWeight: '600'
    lineHeight: 52px
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.005em
  label-md:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  margin: 3rem
  margin-sm: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.75rem
  space-xl: 3rem
---

## Brand & Style

This design system channels an editorial, high-craft digital atmosphere tailored for premier software platforms, design studios, and product ecosystems. Drawing direct inspiration from the pristine composure of modern SaaS leaders like Voiceflow and the tactile elegance of Fora, the aesthetic balances architectural clarity with an inviting warmth.

### Core Philosophy
- **Modern Editorial:** Generous negative space, disciplined hierarchy, and intentional typographic contrasts that make technical complexity feel digestible and poised.
- **Air & Luminescence:** Backgrounds depart from harsh clinical whites, embracing warm off-white and cream foundations that ease ocular strain while highlighting pure white container surfaces with subtle specular reflections.
- **Micro-Precision:** Ultra-fine hairline strokes (0.5px–1px), restrained interactive shifts, and delicate tinted accents (cobalt blue and coral blush) instead of saturated visual noise.

## Colors

The palette establishes an airy, sophisticated environment dominated by creamy canvases, high-legibility dark ink, and precision accents.

### Palette Roles
- **Base Canvas (`#FBFBFA` / `#F8F9FA`):** Warm mineral and porcelain tones that create a tactile, non-glare foundation.
- **Elevated Surfaces (`#FFFFFF`):** Luminous, pristine card planes suspended above the cream background, paired with subtle borders to evoke physical paper and glass sheets.
- **Primary Ink (`#111418`):** An obsidian-grade neutral ensuring contrast ratios compliant with AAA criteria across all body and headline copy.
- **Muted Ink (`#606770` / `#949CA6`):** Secondary and tertiary text levels tuned for subtle meta-information, timestamps, and architectural labels.
- **Primary Accent (`#1E40AF`):** Precision cobalt blue deployed for active states, key interactive indicators, and purposeful primary CTAs.
- **Warm Accent (`#F43F5E`):** A soft coral pink introduced sparingly for feature tags, highlights, and emotional resonance.
- **Hairline Borders (`rgba(17, 20, 24, 0.07)`): Featherweight delineation lines defining card perimeters without imposing heavy geometric weight.

## Typography

The typographic tension pairs the structured, geometric energy of **Space Grotesk** with the fluid, ergonomic warmth of **Plus Jakarta Sans**.

- **Space Grotesk** directs headings, badges, and technical readouts. Its subtle eccentricities and confident proportions bring an avant-garde editorial character to big hero treatments and section markers.
- **Plus Jakarta Sans** grounds long-form copy, descriptions, and user inputs. Its humanist apertures and high x-height guarantee effortless reading across desktop monitors and handheld screens.
- **Uppercase Micro-Labels:** All section subheadings and category metadata rely on `label-sm` set in Space Grotesk with expanded letter-spacing (`0.04em`–`0.06em`) to deliver tech-forward hierarchy.

## Layout & Spacing

Layouts follow an intentional 12-column grid anchored by generous dynamic paddings and responsive column distributions:

- **Desktop (≥ 1280px):** 12 columns, max container width of 1240px, 48px canvas margin, and 24px gutters. Sections employ vertical padding of `space-xl` × 2 (96px to 120px) to foster a gallery-grade rhythm.
- **Tablet (768px – 1279px):** 8 columns, 32px canvas margin, and 20px gutters. Component clusters reflow to 2-column matrices.
- **Mobile (< 768px):** 4 columns, 20px canvas margin, and 16px gutters. Structural blocks stack vertically with `space-lg` separation.
- **Rhythmic Densities:** Spacing scales operate on an 8pt architectural rhythm, with 4pt half-steps reserved for interior badge, pill, and tag nesting.

## Elevation & Depth

Elevation is achieved through light layering rather than heavy drop shadows, preserving an open, breathable profile:

- **Surface Contrast:** Background `#FBFBFA` sits in subtle opposition to pure white `#FFFFFF` cards, giving elements clear separation before any shadow is introduced.
- **Specular Reflection:** Premium surfaces feature a faint top-edge highlight using an inset hairline: `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9)`.
- **Atmospheric Ambient Shadows:**
  - *Base Cards:* `0 2px 8px rgba(17, 20, 24, 0.025), 0 8px 24px rgba(17, 20, 24, 0.04)`
  - *Hover & Floating Modules:* `0 4px 12px rgba(17, 20, 24, 0.03), 0 16px 40px rgba(17, 20, 24, 0.07)`
- **Hairline Boundaries:** Every floating surface carries a 1px perimeter border set to `rgba(17, 20, 24, 0.06)`, maintaining edge acuity across high-DPI retina screens.

## Shapes

The geometric contouring adheres to level `2` (Rounded), infusing the interface with modern softness while retaining architectural rigor:

- **Standard Containers & Cards:** `1rem` (16px) radius, providing soft corners that integrate harmoniously with editorial grid modules.
- **Interactive Badges, Search Bars & Secondary Buttons:** Fully rounded pill silhouettes (`9999px`) for quick-scan readability and a friendly, polished aesthetic.
- **Media Assets & Previews:** `1rem` to `1.25rem` outer clip with matching internal inset radii to avoid corner collisions.

## Components

### Buttons
- **Primary:** Solid obsidian fill (`#111418`) with white typography (`#FFFFFF`), full pill or 12px radius, and a subtle transform on hover (`translateY(-1px)`).
- **Secondary / Ghost:** Clear or off-white background with a 1px boundary (`rgba(17, 20, 24, 0.1)`), shifting to pure white with `rgba(17, 20, 24, 0.04)` fill on hover.
- **Accent CTAs:** Cobalt `#1E40AF` fill used strictly for focal conversion points, paired with crisp white labels.

### Chips & Badges
- Pill-shaped (`rounded-full`) wrappers with 6px 12px padding.
- Semi-translucent tinted fills (e.g., cobalt at 8% opacity with solid cobalt text, or coral at 8% opacity with solid coral text) combined with hairline borders.

### Cards & Feature Tiles
- Pure `#FFFFFF` surfaces with 24px to 32px internal padding.
- Light sheen on hover: shadow smoothly blossoms into the atmospheric tier while the border deepens slightly from 6% to 10% opacity.
- Top and bottom inner dividers rendered as 1px hairline rules with fade-out masks on their extremities.

### Form Inputs & Search Fields
- Crisp `#FFFFFF` surface with an embedded 1px border (`rgba(17, 20, 24, 0.1)`).
- Height: 48px to 52px for comfortable desktop and tactile touch interactions.
- Focus state: Border transitions to `#1E40AF` complemented by an ethereal focus ring (`box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.12)`).

### Metric Callouts & Social Proof Strips
- Oversized tabular figures in Space Grotesk (`display-xl`), grounded by muted metadata underneath.
- Monochromatic client logomarks set to 40% neutral opacity, rising to 100% on cursor entry.