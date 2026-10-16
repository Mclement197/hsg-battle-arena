---
name: HSG Battle Arena
description: Campus legends in an emerald arcade roster
colors:
  emerald: "#39eea1"
  forest-black: "#031910"
  panel: "#092b20"
  white: "#f0fff7"
  muted: "#b1cebf"
  border: "#3d6957"
  hover: "#c5ffe1"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, sans-serif"
    fontSize: "clamp(2.6rem, 5.8vw, 5.5rem)"
    fontWeight: 800
    lineHeight: 0.96
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
rounded:
  square: "0"
spacing:
  compact: "0.7rem"
  regular: "1rem"
  separated: "1.5rem"
  wide: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.emerald}"
    textColor: "#002419"
    rounded: "{rounded.square}"
    padding: "0.9rem 1.6rem"
    height: "56px"
  button-primary-hover:
    backgroundColor: "{colors.hover}"
    textColor: "#002419"
  input:
    backgroundColor: "{colors.forest-black}"
    textColor: "{colors.white}"
    rounded: "{rounded.square}"
    padding: "0.8rem"
    height: "54px"
---

# Design System: HSG Battle Arena

## Overview
**Creative North Star: "The campus arcade"**
The user-pinned fighting-game selection reference becomes an emerald, forest-black campus arena. Large fighter portraits, condensed italic names, angular frames and command meters carry the experience, rather than a dashboard skin.

**Key Characteristics:**
- Forest-dark surfaces, bright emerald selection, white combat information.
- Strong type hierarchy and square/angular controls.
- Original replaceable fighter art; real numeric command profiles.

## Colors
Primary emerald is reserved for active selection, main progression and health. Forest-black and deeper green panels establish the dark backdrop; white is primary ink and tinted pale green is secondary ink. The user specifically requests this green world rather than the reference red.

**The Selection Rule.** Emerald outlines and bounded light identify the active fighter, never an implied gameplay advantage beyond the displayed stats.

## Typography
Display uses locally served Barlow Condensed 800 with italic styling, uppercase and compact leading; body and labels use locally served Barlow. Main headings scale to the frontmatter display maximum, with a six-rem home title. Section titles are roughly two rem; body copy remains one rem at 1.5 leading, up to 72ch. Roster labels and numbers use at least 12px; HP and timer values use tabular numerals.

## Layout
Screens share a maximum width of 1500px (battle 1600px) and fluid 1.2–3rem padding. Roster selection is an asymmetric large-preview/six-card grid at desktop widths, switching at 760px to a compact preview above the roster; below 500px the roster has two columns. Arena panels are staggered on desktop and horizontal image/text rows on phones. Match controls remain large two-column targets on phones. Breakpoints: 1050px, 760px, 500px.

## Elevation & Depth
Layered green tones and subdued existing arena imagery build depth. Fighters have soft downward black shadows. The selected roster outline carries a restrained emerald light, directly requested by the reference, not general-purpose panel glow. Ordinary panels use a single border rather than a floating card shadow.

## Shapes
Square corners and simple clipped angular ends on progression, mode and arena controls establish the frame language. Portrait cards keep straight continuous selection outlines. One-pixel muted green is the default border; active fighter frames use two pixels of bright green. Rounding is reserved for the stage floor ellipse and existing resolution-only action motifs.

## Components
- **Progression buttons:** emerald fill, dark text, 56px minimum height, angular lower-right corner. Pale-green hover, three-pixel white focus outline with offset, visibly disabled state.
- **Mode selectors:** three stacked angular buttons, strong condensed title plus a functional mode description; first mode uses emerald, others use dark green, all highlight on hover.
- **Roster cards:** cropped original portraits, two-line name area, team/ability label and four segmented numeric bars; the active card has a luminous selection frame. Large preview exposes the archetype and larger bars.
- **Command meters:** ten segments, explicit label and adjacent exact number. Different command units are documented beneath the roster. They are not arbitrary ratings.
- **Fields:** dark square fields, green border, light text, green caret, visible white keyboard focus. Errors remain an explicit alert with recovery information.
- **Navigation:** compact brand and device-local sound button; Main Menu stays available on every screen. Connection state uses text at desktop and an indicator on narrow layouts.
- **Motion:** a short brightness-lock when changing the selected portrait, bounded fighter arrival and resolution-only move effects. Reduced motion disables transitions and positional animation; content never relies on animation to become visible.

## Do's and Don'ts
### Do:
- **Do** carry the forest/emerald/white world across setup, combat and results.
- **Do** keep labels, units and exact values alongside segmented bars.
- **Do** preserve original artwork IDs so final art can replace placeholders without changing game rules.
- **Do** prioritize readable controls and authoritative connection states over effects.
### Don't:
- **Don't** turn the roster into a generic rounded dashboard grid.
- **Don't** copy the reference's third-party characters or red palette.
- **Don't** let decorative ratings differ from the authoritative combat values.

Functional team labels and GAME OVER are state information, not a reusable decorative eyebrow pattern. Inherited glyph move icons are not canonized as a future icon system. No generated imagery ships. The main menu uses the user-supplied HSG Learning Center photo as an optimized WebP with embedded source metadata and a provenance sidecar; a separate CSS pseudo-element applies translucent HSG-green tint without dimming the foreground. Other artwork remains original SVG. New PNGs are verification captures only.
