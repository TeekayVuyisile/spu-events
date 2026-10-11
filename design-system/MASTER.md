# SPU Events Design System (MASTER)

The single source of truth for UI. Page-specific deviations live in `design-system/pages/<page>.md` and override this file.
Curated from ui-ux-pro-max results: style "Vibrant & Block-based" + "Bento Grids" + "Dark Mode (OLED)", the "Event Management" palette, the "Geometric Modern" type pairing, and shadcn theming guidelines.

## 1. Concept: "After Dark"

**Light-first** (user preference, 2026-10-10): light is the default theme and dark is the alternative. Dark is forced only on the gate scanner. It uses one bold signature motif: the **ticket stub**. Cards have notched edges and perforated dividers, and amounts and codes use a monospace font. The motif makes the app recognisable without decoration for its own sake.

- Personality: energetic, social, trustworthy with money.
- Layout: block-based, with bento grids for dashboards and big type for headings.
- Avoid: generic SaaS gradients everywhere, glassmorphism on content, neon glows on text, emoji icons.

## 2. Color tokens (shadcn CSS variables, HSL)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `255 100% 99%` #FBFAFF | `260 48% 5%` #0B0714 | page |
| `--foreground` | `259 52% 13%` #1A1033 | `258 60% 97%` #F4F1FB | body text |
| `--card` | `0 0% 100%` #FFFFFF | `259 42% 9%` #140E22 | surfaces |
| `--muted` | `256 50% 95%` #F1EEF9 | `258 35% 14%` #1E1730 | subtle fills |
| `--muted-foreground` | `257 15% 38%` #5B5370 | `256 20% 69%` #A79FBF | secondary text (≥4.5:1 both modes) |
| `--primary` | `262 83% 58%` #7C3AED | `255 92% 76%` #A78BFA | brand, links, focus |
| `--primary-foreground` | `0 0% 100%` | `259 52% 13%` | text on primary |
| `--cta` ("ember") | `25 95% 53%` #F97316 | `27 96% 61%` #FB923C | **one** main action per view: Get ticket, Top up |
| `--cta-foreground` | `24 100% 5%` #1A0B00 | `24 100% 5%` | dark text on orange (white on orange fails contrast) |
| `--border` | `256 40% 91%` #E4DFF2 | `258 30% 19%` #2A2240 | visible in both modes |
| `--ring` | = primary | = primary | focus ring 2px + 2px offset |
| `--success` | #166534 | #4ADE80 | valid scan, credit |
| `--warning` | #92400E | #FBBF24 | already used, pending |
| `--destructive` | #B91C1C | #F87171 | invalid, debit, cancel |

Rules:
- Components use only semantic tokens (`bg-primary`, `text-muted-foreground`), never raw hex or `bg-violet-600`.
- Status is never shown by colour alone. Always pair it with an icon and a label.
- The aurora gradient (`primary → cta` at 20% opacity) appears only on the landing hero and the ticket-issued moment.

## 3. Typography

| Role | Font | Weights | Use |
|---|---|---|---|
| Display / headings | **Outfit** | 500–800 | page titles, event titles, KPI numbers |
| Body / UI | **Work Sans** | 400–600 | everything else, 16px minimum body text |
| Data / ticket | **JetBrains Mono** (tabular numbers) | 500 | ticket codes, wallet amounts, timestamps, counters |

Self-host the fonts with `@fontsource` packages, not the Google CDN, so they load fast and keep working offline for staff.
Scale (rem): 0.75 · 0.875 · 1 · 1.125 · 1.25 · 1.5 · 2 · 2.5 · 3.5 (hero). Line height 1.6 for body and 1.1 for display. Lines are capped at 70ch.

## 4. Shape, space, elevation

- Radius: `--radius: 1rem`. Cards 16–20px, buttons 12px, chips fully rounded.
- **Ticket notch:** a `.ticket` utility applies a radial-gradient mask that cuts 12px half-circles into the left and right edges at the divider line, plus a dashed perforation `border-top`.
- Spacing: 4px base. Sections use 48px or more on desktop and 32px on mobile. The page gutter is 16px on mobile.
- Elevation: flat in dark mode (contrast comes from surface colours), soft shadows only in light mode.
- z-index scale: 10 sticky · 20 nav · 30 dropdown · 40 sheet/modal · 50 toast.
- Container: `max-w-7xl` everywhere.

## 5. Motion (Framer Motion)

Wrap the app in `<MotionConfig reducedMotion="user">`. Under reduced motion, every transform becomes an opacity fade.

| Token | Value |
|---|---|
| `fast` | 150ms (hover, press) |
| `base` | 220ms (enter/exit, toggles) |
| `slow` | 320ms (page, sheet) |
| `ease.out` | `[0.22, 1, 0.36, 1]` entering |
| `ease.in` | `[0.4, 0, 1, 1]` exiting |
| `spring.snappy` | `{ type: "spring", stiffness: 400, damping: 32 }` layout/shared elements |
| `stagger` | 40ms between list children, max 8 children animated |

Animate only `transform` and `opacity`. Hover effects never shift the layout: use colour, border or shadow changes, or `scale` up to 1.02 on cards only.

**Signature moments.** Each view gets at most one or two. These are the portfolio highlights:
1. **Event card → event page:** a shared-element transition (`layoutId` on the cover image and title).
2. **Ticket issued:** the stub "prints" (slides up out of a slot), the perforation draws in, and the QR fades in. A confetti burst plays once (skipped under reduced motion).
3. **Gate scan result:** the screen fills with the result colour from the scanner frame outward. The icon pops in with a spring, and the device vibrates through `navigator.vibrate`. The result auto-dismisses after 2.5s.
4. **Live counters:** numbers roll digit by digit when check-ins and wallet balances change.
5. **Wallet:** new ledger rows slide in, and the balance rolls to its new value.

Continuous animation is allowed only for loaders and the "LIVE" pulse dot.

## 6. Components (shadcn/ui base)

Button (variants: `default`, `cta`, `outline`, `ghost`, `destructive`; buttons show a loading state and are disabled while submitting) · Card · TicketCard · EventCard · Badge/StatusPill · Input/Form (labels always visible, errors shown under the field) · Sheet (mobile nav and filters) · Dialog · Tabs · Table (admin, with sticky header) · Skeleton (matches the final layout) · Toast (sonner) · Chart (Recharts through shadcn `chartConfig`, never inline colours) · Avatar · CommandK search (admin).

Icons: **Lucide** only, 20px in UI and 24px in navigation, with stroke width 1.75.

## 7. Layout per role

- **Student:** mobile-first. A bottom tab bar (Discover · Tickets · Wallet · Inbox · Me) below 768px, a top nav above that.
- **Admin:** a collapsible left sidebar, bento KPI grid, dense tables, and Cmd/Ctrl+K search.
- **Staff:** a single-purpose full-screen scanner with no distractions. The theme is always dark there.

## 8. Accessibility checklist (blocking)

- Text contrast is 4.5:1 or better (3:1 for large text) in both themes.
- Every interactive element has a visible focus ring, `cursor-pointer` and a touch target of at least 44×44px.
- Icon-only buttons have an `aria-label`. Images have `alt` text, and decorative images use `alt=""`.
- Live regions: scan results and toasts use `aria-live="assertive"` or `"polite"`.
- The live chart has a pause control and a table alternative.
- Layout is tested at 375, 768, 1024 and 1440px with no horizontal scroll.
