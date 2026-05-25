# Wedding Expense Tracker — Master Context

> **Purpose of this file.** Canonical handoff document for Wedding Expense Tracker. Drop the contents (or a link to this file) into any fresh AI chat — Claude, GPT, Gemini — and the assistant will have everything it needs: what the product is, why it exists, how it is built, what is already shipped, and exactly where work stands right now.
>
> **Last updated:** 2026-05-24
> **Project day 0:** 2026-04-28
> **Current phase:** P0 Prototype → P1 Launch prep — core logic + i18n + design system + receipts complete; production-grade Google auth, security-audit hardening, password reset, CSP, and deploy config (Vercel + Railway) now in place; real-family testing + go-live pending
> **Owner / Maintainer:** Alok Kumar. Primary contact: `contact.alokkumarr@gmail.com`
> **Working directory:** `d:\SaaS Project\Wedding ExpTracker`
> **Environment:** Windows 11, Node 18+, MongoDB Atlas, Vite 8 dev server on `localhost:5173`, Express backend on `localhost:5000`
> **Live URL:** Not yet deployed (target: Railway or Fly.io for always-on hosting)

---

## Table of contents

1. [The idea in detail](#1-the-idea-in-detail)
2. [Why this can win — market and wedge](#2-why-this-can-win--market-and-wedge)
3. [Monetization model](#3-monetization-model)
4. [Engineering philosophy and target bar](#4-engineering-philosophy-and-target-bar)
5. [Architecture overview](#5-architecture-overview)
6. [Tech stack](#6-tech-stack)
7. [Repository layout](#7-repository-layout)
8. [Roadmap (phased)](#8-roadmap-phased)
9. [Progress log — what has been built](#9-progress-log--what-has-been-built)
10. [What has NOT been built yet (deliberately)](#10-what-has-not-been-built-yet-deliberately)
11. [Top risks and unresolved questions](#11-top-risks-and-unresolved-questions)
12. [How a fresh AI chat should use this file](#12-how-a-fresh-ai-chat-should-use-this-file)

---

## 1. The idea in detail

### Elevator pitch

**Wedding Expense Tracker is a family-first, collaborative expense management platform built for Indian weddings.** It lets every family member — from tech-savvy cousins to grandparents with no tech knowledge — add their side of the wedding expenses through a dead-simple mobile-friendly interface. All individual expenses roll up into a master wedding budget view, giving the organizer real-time visibility into total spending, category breakdowns, and who paid what. One person creates the wedding, shares a 6-character join code, and the whole family is connected.

### Core mechanic — how it works

1. **Admin creates a wedding** — provides wedding name, couple names, date, budget, and sets up their account with email + password. System generates a unique 6-character join code (e.g., `A3F9B2`).
2. **Family members join** — enter the join code + their name. No email or password required for regular members (friction-free onboarding for non-tech users). They get a JWT token and are immediately in.
3. **Anyone adds expenses** — pick a category (Venue, Catering, Decoration, etc. — 10 defaults, admin-customizable), enter the amount, optionally add description/vendor/paid-by details. Three-step wizard: Category → Amount → Details.
4. **Dashboard aggregates everything** — total wedding spend, budget progress bar, category breakdown with visual bars, top contributors leaderboard, recent activity feed. All data is real-time.
5. **Admin manages** — can edit wedding details, add/remove categories, remove members (soft-delete with re-entry support), view all expenses. Members can only edit/delete their own expenses.

### Roles and surfaces

| Role | Auth method | Can do |
|---|---|---|
| `admin` | Email + password (or Google) | Create wedding, edit settings, manage categories, remove members, CRUD all expenses |
| `member` | Join code + name (no password) | Add expenses, view dashboard, view all expenses, edit/delete own expenses only |

### Why now

- Indian wedding spending is ₹5-50 lakh+ with dozens of family members making purchases independently — no one has a clear picture of total spend until it's too late.
- Existing tools (spreadsheets, Splitwise) require tech literacy and aren't designed for the multi-generational, multi-contributor wedding context.
- Mobile-first India means the solution must work beautifully on phones with minimal friction.

---

## 2. Why this can win — market and wedge

### The competitive reality

- **Spreadsheets** — Most families track wedding expenses in Google Sheets or paper notebooks. Works for 1-2 people, breaks down with 10+ contributors.
- **Splitwise** — Designed for splitting bills among friends, not for aggregate family expense tracking toward a master budget.
- **Wedding planning apps** (WedMeGood, etc.) — Focus on vendor discovery and checklists, not real-time collaborative expense tracking.

### The wedge

1. **Zero-friction family onboarding** — Join code + name, no email/password required for members. A grandparent can join in 10 seconds.
2. **Hindi-first localization** — Target audience often doesn't read English. Full Hindi UI toggle planned (no competitor offers this).
3. **India-specific defaults** — ₹ currency, Indian number formatting (Lakhs/Crores), culturally relevant categories (Jewelry, Mehendi, etc.).
4. **Master budget view** — Real-time aggregation of all family members' expenses into one dashboard with budget tracking.

### Target customer

Indian families planning weddings — specifically the organizer (usually a parent or elder sibling) who needs to track what everyone is spending. Initial wedge: personal network, then word-of-mouth through wedding communities.

---

## 3. Monetization model

### Current plan: Open source, free forever for core features

| Tier | Price | Includes |
|---|---|---|
| **Free** | ₹0 | Full expense tracking, unlimited members, all current features |
| **Pro** (future) | TBD (minimal) | AI-powered features: smart budget suggestions, expense predictions, receipt OCR, analytics |

**Philosophy:** The core tracking tool should be free — families shouldn't pay to track their own money. Monetization kicks in only when AI features add clear value beyond basic tracking.

---

## 4. Engineering philosophy and target bar

1. **Family-friendly UX above all else.** Every screen, every flow, every button must be usable by someone who has never used a web app. If your grandmother can't figure it out, it's too complicated. Three-tap expense entry is the gold standard.

2. **Mobile-first, always.** This will be used on phones during wedding chaos — shopping trips, vendor visits, late-night planning. Max container width is 500px. Bottom navigation. Touch-friendly hit targets. No hover-dependent interactions.

3. **Boring infrastructure until the bottleneck proves otherwise.** Express + MongoDB monolith is sufficient until thousands of concurrent weddings prove it isn't. No microservices, no Redis, no queues — add complexity only when load demands it.

4. **Hindi is not an afterthought.** When i18n lands, every string must have a Hindi translation. UI must handle Devanagari script gracefully — wider text, proper font rendering, RTL-safe spacing.

5. **Re-entry is a first-class flow.** Family dynamics are complex. Members get removed and re-added. The system must handle: rejoining with same name (reactivation), logging back in after removal (via email for admins), and preserving expense history across deactivation cycles.

### Engineering maturity

| Phase | Bar | Status |
|---|---|---|
| P0 Prototype | Core CRUD works, auth works, mobile-responsive | ✅ Current |
| P1 Launch | Deployed, always-on, error monitoring, SEO | 🔜 Next |
| P2 Growth | i18n (Hindi), receipt uploads, analytics, notifications | Planned |
| P3 Scale | Mobile app (React Native), AI features, payment splitting | Future |

---

## 5. Architecture overview

### High-level shape

```
┌─────────────────────────────────────────┐
│         Frontend (React 19 SPA)         │
│   Vite 8 + React Router 6 + Axios      │
│   Glassmorphic UI, mobile-first 500px   │
└──────────────────┬──────────────────────┘
                   │ HTTP (Vite proxy /api → :5000)
                   ▼
┌─────────────────────────────────────────┐
│       Backend (Express 4 REST API)      │
│  Helmet → CORS → RateLimit → Routes    │
│  JWT auth (30d) + bcrypt passwords      │
└──┬──────────────────────────────────┬───┘
   │                                  │
   ▼                                  ▼
┌──────────────┐            ┌─────────────────┐
│ MongoDB Atlas│            │ Google OAuth     │
│ 3 collections│            │ (Sign-In button) │
│ Wedding      │            └─────────────────┘
│ Member       │
│ Expense      │
└──────────────┘
```

### Key architectural decisions

- **No controllers directory** — Route files contain business logic directly. Acceptable at current scale (3 route files, ~900 lines total). Extract controllers when any route file exceeds 500 lines.
- **Soft-delete for members** — `isActive: false` instead of `DELETE`. Preserves expense history and enables re-entry flow.
- **Wedding-scoped isolation** — Every query filters by `weddingId` via the `protect` middleware which extracts it from the JWT-linked member. No cross-wedding data leakage.
- **Join code as primary onboarding** — 6-character hex code (crypto.randomBytes), uppercase, collision-checked. Designed for verbal sharing ("tell Chacha the code is A3F9B2").
- **Compound indexes** — `(weddingId, email)` unique partial index on Member, `(weddingId, createdAt)` and `(weddingId, category)` on Expense for query performance.

### API surface

| Mount | Purpose | Auth |
|---|---|---|
| `GET /api/health` | Health check | Public |
| `POST /api/auth/login` | Email+password login (multi-wedding support) | Public |
| `POST /api/auth/login/select-wedding` | Pick wedding when user has multiple | Public |
| `POST /api/auth/google` | Google Sign-In | Public |
| `POST /api/weddings` | Create wedding + admin account | Public |
| `POST /api/weddings/join` | Join via code (with re-entry) | Public (rate-limited) |
| `GET /api/weddings/current` | Get current wedding details | Protected |
| `PUT /api/weddings/current` | Update wedding (admin only) | Protected + Admin |
| `GET /api/weddings/current/members` | List active members | Protected |
| `DELETE /api/weddings/current/members/:id` | Remove member (soft-delete) | Protected + Admin |
| `POST /api/expenses` | Add expense | Protected |
| `GET /api/expenses` | List expenses (paginated, filterable) | Protected |
| `GET /api/expenses/my` | Current member's expenses | Protected |
| `GET /api/expenses/summary` | Aggregated dashboard data | Protected |
| `PUT /api/expenses/:id` | Edit expense (owner or admin) | Protected |
| `DELETE /api/expenses/:id` | Delete expense (owner or admin) | Protected |

### Rate limiting

- Global: 200 requests / 15 min per IP
- Auth + Join endpoints: 30 requests / 15 min per IP (stricter)

---

## 6. Tech stack

### Languages and tooling

- **TypeScript / JavaScript** — Strictly typed frontend via TSX/TS; CommonJS on backend
- **Node.js 18+** — Runtime
- **npm** — Package manager

### Frontend dependencies

| Dependency | Version | Purpose |
|---|---|---|
| `react` | 19.2.5 | UI framework |
| `react-dom` | 19.2.5 | DOM renderer |
| `react-router-dom` | 6.30.3 | Client-side routing (7 routes) |
| `axios` | 1.15.2 | HTTP client with interceptors (auto-attach JWT, global 401 handler) |
| `framer-motion` | 12.38.0 | Animation library (available but lightly used currently) |
| `react-hot-toast` | 2.6.0 | Toast notifications (glassmorphic styled) |
| `react-icons` | 5.6.0 | Icon library (available, emoji used primarily) |
| `vite` | 8.0.10 | Build tool + dev server with API proxy |
| `@vitejs/plugin-react` | 6.0.1 | React fast-refresh for Vite |

### Backend dependencies

| Dependency | Version | Purpose |
|---|---|---|
| `express` | 4.21.0 | HTTP framework |
| `mongoose` | 8.7.0 | MongoDB ODM (3 schemas with virtuals, hooks, methods) |
| `bcryptjs` | 2.4.3 | Password hashing (salt rounds: 12) |
| `jsonwebtoken` | 9.0.2 | JWT generation + verification (30-day expiry) |
| `cors` | 2.8.5 | Cross-origin resource sharing |
| `helmet` | 7.1.0 | Security headers |
| `express-rate-limit` | 7.4.0 | Request throttling |
| `morgan` | 1.10.0 | HTTP request logging (dev mode only) |
| `multer` | 1.4.5 | File upload middleware (installed, not yet wired — for receipt uploads) |
| `validator` | 13.12.0 | Email validation |
| `dotenv` | 16.4.5 | Environment variable loading |
| `nodemon` | 3.1.4 | Dev auto-restart (devDependency) |

### Data layer

- **MongoDB Atlas** — Cloud-hosted, free tier (M0) sufficient for prototype
- **3 collections:** `weddings`, `members`, `expenses`
- **Indexes:** Compound indexes on expense queries, partial unique index on member email per wedding

### Design system

- **Font:** Inter (Google Fonts) — weights 300-800
- **Dark theme:** `#09090B` base, glassmorphic cards with `blur(24px)`, rose/violet accent palette (`#F43F5E` / `#8B5CF6`)
- **Light theme:** `#F2F0EF` base, white glass cards, deeper rose for contrast
- **Theme toggle:** Persisted to `localStorage`, applied via `data-theme` attribute
- **Animations:** `fadeInUp` entry animation, cubic-bezier easing, skeleton loading states

---

## 7. Repository layout

```
Wedding ExpTracker/
├── MASTER_CONTEXT.md              # THIS FILE — canonical project context
├── Backend/
│   ├── server.js                  # Entry point — middleware stack, routes, DB connect, graceful shutdown
│   ├── middleware/
│   │   ├── auth.js                # JWT protect, adminOnly, generateToken
│   │   └── errorHandler.js        # Global error handler + asyncHandler wrapper
│   ├── models/
│   │   ├── Wedding.js             # Schema: weddingName, coupleNames, joinCode, budget, categories
│   │   ├── Member.js              # Schema: name, email, password, role, weddingId, isActive
│   │   └── Expense.js             # Schema: amount, category, description, paidBy, vendor, notes
│   ├── routes/
│   │   ├── authRoutes.js          # Login (email), Google OAuth, multi-wedding selection
│   │   ├── weddingRoutes.js       # Create, join, CRUD wedding, manage members
│   │   └── expenseRoutes.js       # CRUD expenses, summary aggregation pipeline
│   ├── package.json
│   └── .env                       # MONGODB_URI, JWT_SECRET, JWT_EXPIRES_IN, FRONTEND_URL
├── Frontend/
│   ├── index.html                 # SPA shell — Inter font, Google Sign-In SDK, meta tags
│   ├── vite.config.js             # Dev server :5173, proxy /api → :5000
│   ├── src/
│   │   ├── main.jsx               # React root — BrowserRouter, LanguageProvider → WeddingProvider, Toaster
│   │   ├── App.jsx                # Router — 7 routes with ProtectedRoute wrapper
│   │   ├── api.js                 # Axios instance — interceptors, 16 API functions
│   │   ├── index.css              # Premium SaaS design system v2 — ~900 lines, dark/warm-cream light themes, responsive (mobile/tablet/desktop)
│   │   ├── context/
│   │   │   ├── WeddingContext.jsx  # Global state — member, wedding, summary, members, auth methods
│   │   │   └── LanguageContext.jsx # i18n provider — lang, t(key, vars), tCat(), tServer(), toggleLang
│   │   ├── i18n/
│   │   │   └── translations.js    # Flat-keyed en + hi dictionaries + server-message regex/exact map
│   │   ├── utils/
│   │   │   └── format.js          # fmtAmount (K/L/Cr ↔ हज़ार/लाख/करोड़), fmtDate (locale + Latin numerals)
│   │   ├── constants/
│   │   │   └── defaultCategories.js # Canonical default category list (mirrors backend) + getMissingDefaults() helper
│   │   ├── components/
│   │   │   ├── BottomNav.jsx      # 5-tab bottom nav with FAB; floats as pill on desktop
│   │   │   ├── ThemeToggle.jsx    # Dark/light toggle, persists to localStorage
│   │   │   ├── LanguageToggle.jsx # EN ↔ हिं circular toggle, matches ThemeToggle style
│   │   │   ├── ExpenseDetailSheet.jsx # Bottom-sheet popup with full expense details + clickable receipt
│   │   │   └── ReceiptViewer.jsx  # Full-screen image viewer — pinch/wheel/dbl-tap zoom, drag-to-pan, Cloudinary download
│   │   └── pages/
│   │       ├── LandingPage.jsx    # Hero + Create/Join/Login forms + Google Sign-In + multi-wedding selector
│   │       ├── Dashboard.jsx      # Hero stats, category breakdown, top contributors, recent activity
│   │       ├── AddExpense.jsx     # 3-step wizard: Category → Amount → Details
│   │       ├── MyExpenses.jsx     # Current member's expense list
│   │       ├── AllExpenses.jsx    # All wedding expenses (paginated)
│   │       ├── Members.jsx        # Family member list with join code sharing
│   │       └── Settings.jsx       # Wedding details editor, category manager, leave/logout
│   ├── package.json
│   └── .env                       # VITE_GOOGLE_CLIENT_ID
└── .agents/skills/                # AI agent skills
    ├── master-context-generator/  # THIS skill — generates/updates MASTER_CONTEXT.md
    └── skill-creator/             # Meta-skill for creating new skills
```

---

## 8. Roadmap (phased)

### Phase 0 — Prototype — CURRENT
**Goal:** Core expense tracking works end-to-end with polished UI.
- [x] Wedding CRUD with join code system
- [x] Member management (join, remove, re-entry)
- [x] Expense CRUD with category validation
- [x] Dashboard with aggregations (total, by-category, by-member, daily trend)
- [x] JWT auth with email+password for admin
- [x] Google Sign-In integration
- [x] Multi-wedding support (one email → multiple weddings)
- [x] Premium glassmorphic dark/light theme
- [x] Mobile-first responsive design (500px max)
- [x] 3-step expense wizard (Category → Amount → Details)
- [x] Rate limiting and security headers
- [ ] End-to-end testing with real family
- [ ] Bug fixes from real-world usage
- **Gate:** One real wedding uses it end-to-end without confusion — **NOT YET MET**.

### Phase 1 — Launch
**Goal:** Deployed, always-on, production-safe.
- [ ] Deploy backend to Railway/Fly.io (always-on, no cold starts)
- [ ] Deploy frontend to Vercel/Netlify
- [ ] Environment variable management (production secrets)
- [ ] Error monitoring (Sentry or LogRocket)
- [ ] SEO and Open Graph meta tags
- [ ] PWA support (installable on mobile home screen)
- [ ] Loading states and error boundaries
- **Gate:** Deployed URL works reliably for 7 days, zero downtime.

### Phase 2 — Growth
**Goal:** Features that make it indispensable for Indian families.
- [x] **Hindi localization (i18n)** — Full UI translation, toggle button, Devanagari font support *(pulled forward to P0 on 2026-05-07; conversational North-Indian Hindi, not Sanskrit-heavy)*
- [ ] **Receipt uploads** — Photo upload via multer, cloud storage (S3/Cloudinary), link to expense
- [ ] **Analytics dashboard** — Charts (spending trend, budget burn rate, category pie chart)
- [ ] **Notifications** — Push/email alerts for new expenses, budget warnings, member joins
- [ ] **Export** — Download expense report as PDF/CSV
- **Gate:** 10+ weddings using it, Hindi mode tested by non-English speakers.

### Phase 3 — Scale
**Goal:** Platform-grade product.
- [ ] **Mobile app** — React Native with identical features, push notifications
- [ ] **Payment splitting** — Track who owes whom, settlement suggestions
- [ ] **AI features** — Smart budget suggestions, expense predictions, receipt OCR, anomaly detection
- [ ] **Multi-language** — Beyond Hindi (Marathi, Gujarati, Tamil, etc.)
- [ ] **Vendor directory** — Rate and review wedding vendors
- **Gate:** 100+ active weddings, app store presence, first paying customers.

---

## 9. Progress log — what has been built

### Baseline inventory (as of 2026-04-28)

**Session focus:** Full-stack prototype built from scratch in a single session.

**Feature — Complete Backend (`Backend/`):**
- Express server with security middleware stack (Helmet, CORS, rate limiting, morgan)
- 3 Mongoose models with validation, hooks, virtuals, and compound indexes
- JWT auth system (30-day tokens) with bcrypt password hashing (12 rounds)
- Google Sign-In backend handler (JWT credential decoding)
- Multi-wedding login flow (one email can have accounts in multiple weddings)
- Member re-entry system (soft-delete + reactivation on rejoin)
- Expense summary aggregation pipeline (MongoDB `$aggregate` — total, by-category, by-member, daily trend)
- Global error handler with Mongoose-specific error formatting
- asyncHandler wrapper eliminating try/catch boilerplate

**Feature — Complete Frontend (`Frontend/`):**
- React 19 SPA with Vite 8 and React Router 6
- WeddingContext provider — centralized state for member, wedding, summary, members
- Axios API client with request/response interceptors (auto JWT, global 401 logout)
- LandingPage with 4 flows: Create Wedding, Join with Code, Login, Select Wedding (multi-wedding)
- Dashboard with hero stats, budget progress bar, category breakdown, top contributors, recent activity
- 3-step AddExpense wizard with category grid, amount input, and details form
- MyExpenses and AllExpenses list views
- Members page with join code sharing and admin remove capability
- Settings page with inline editing, category management, and leave/logout confirmation modal
- BottomNav with 5 tabs and floating action button
- ThemeToggle component with localStorage persistence

**Feature — Design System (`index.css` — 559 lines):**
- Full CSS custom properties system (colors, shadows, radii, typography)
- Dark theme (`#09090B`) and light theme (`#F2F0EF`) with smooth switching
- Glassmorphic cards with backdrop-filter blur
- Premium components: glass-card, stat-card, expense-item, category-chip, budget-bar, avatar
- Noise texture overlay and radial gradient background mesh
- Custom scrollbar, toast overrides, skeleton loading animations
- Mobile-first with 500px container, safe-area-inset bottom padding

### 2026-04-28 — Theme & Responsiveness Polish

**Enhancement — ThemeToggle (`ThemeToggle.jsx`):**
- Implemented persistent light/dark mode toggle
- Light theme uses `#F2F0EF` background (smooth, warm off-white)
- Toggle positioned contextually: absolute top-right on LandingPage, inline with avatar on Dashboard
- Prevents UI overlap with avatar on mobile screens

**Files changed:**
- `Frontend/src/components/ThemeToggle.jsx` — New component
- `Frontend/src/pages/Dashboard.jsx` — Integrated toggle next to avatar
- `Frontend/src/pages/LandingPage.jsx` — Integrated toggle in absolute position
- `Frontend/src/index.css` — Added `[data-theme="light"]` CSS custom properties

### 2026-05-07 — Hindi i18n + Premium UI Design System v2 + Beautification Pass

A long single-day session that pulled forward the P2 Hindi i18n feature (per user request — target audience includes elders with no English knowledge), then completely rebuilt the design system into something professional and modern, then did a beautification pass to add warmth and personality.

**Feature — Hindi/English language toggle:**
- Custom context-based i18n (no `react-i18next` — chose lightweight bespoke solution to keep bundle small and align with §11 unresolved question, now resolved)
- All client-facing strings translated to **conversational North-Indian Hindi** (saral bol-chaal, no Sanskrit-heavy register). Examples: "नमस्ते" not "सुस्वागतम्"; "किसने पैसे दिए" not "व्ययकर्ता"
- Server-message translation: 40+ exact-match + regex patterns for backend-returned strings; falls back to original English on unknown messages
- Latin numerals preserved in Hindi mode (`numberingSystem: 'latn'` on Intl.DateTimeFormat) — Indian users read "₹ 5,00,000" more comfortably than Devanagari "५,००,०००"
- K/L/Cr suffixes translate to हज़ार/लाख/करोड़ when in Hindi mode
- Noto Sans Devanagari added as font fallback in `index.html` and `--font` CSS variable
- `<html lang>` attribute syncs with current language for screen-reader/font-hinting support
- Persists to `localStorage` key `language`; defaults to English; `try/catch` guards for private-browsing mode
- Toggle reachable from 3 surfaces: Landing top-right, Dashboard inline, Settings preferences row
- User-typed data (names, wedding names, descriptions, vendor names, custom admin-added categories) is never translated — only UI chrome translates
- `tCat()` translates known canonical category names; admin-added custom categories pass through

**Feature — Premium design system v2 (`index.css` ~900 lines):**
- Refined color tokens (preserved all legacy variable names so existing inline `style={{}}` JSX continues to work — no breaking changes)
- New tokens: full `--space-*` 4px scale, `--radius-xs/xl`, `--ease-spring`, `--gradient-primary`, `--gradient-soft`, layered shadow ladder (xs/sm/md/lg/xl + glow + glow-soft)
- **Modern responsive breakpoints** (mobile-first):
  - Mobile (< 720px): 520px container, 3-col category grid, full-width bottom nav
  - Tablet (≥ 720px): 720px container, 4-col category grid, two-column dashboard layout
  - Desktop (≥ 1024px): 1120px container, 5-col category grid, **bottom nav floats as a centered pill** (modern SaaS pattern)
  - Wide (≥ 1280px): bigger hero typography
- Gradient primary buttons with animated background-position shift on hover, glow ring on focus-visible, scale-down on active
- Animated step indicator on AddExpense (gradient fills as user advances)
- Animated budget bar (subtle shimmer + glide highlight; switches to red gradient when over budget)
- Stagger entrance utility (`.stagger > *`) — cascading fade-up on cards/list items
- Refined skeleton with shimmer animation
- New modal pattern (`.modal-backdrop` + `.modal-content`) with backdrop-blur and scale-in entrance
- Pill component (`.pill`, `.pill-primary`, `.pill-success`) for badges
- `.section-title` for uppercase tracked-out section headers
- Section/empty-state classes refined
- Bottom nav active indicator: gradient hairline at top + animated icon scale
- FAB: gradient background, layered shadow with rose glow, lift on hover
- All amounts/codes/page numbers use `font-feature-settings: 'tnum'` (tabular numerals) so digits don't jiggle on data change
- `100dvh` for landing pages (avoids mobile-browser-chrome push)
- `min-height: 44px` on buttons (WCAG touch target minimum)
- `-webkit-tap-highlight-color: transparent` (kills iOS gray-flash on tap)
- `env(safe-area-inset-bottom)` on bottom nav (iPhone notch / home indicator)

**Feature — Beautification pass (color, depth, personality):**
- **Light theme overhauled** — was washed-out white; now warm cream `#FDF8F4` base with rose-tinted cards (`rgba(255, 252, 250, 0.72)`)
- **Rose-tinted shadows** in light mode (`rgba(190, 70, 100, 0.08)` instead of cold black) — depth feels celebratory, not corporate
- Warm near-black text `#1F1316` (instead of cold zinc) for headings in light mode
- **Background mesh** — 4 large overlapping gradient ellipses (rose, violet, soft pink, gold-amber) that drift slowly via 22-second `meshDrift` animation (GPU-accelerated transform)
- **Hero card decorative corner glow** — `::after` blurred radial glow fills empty space; optional `.sparkle` modifier overlays a subtle 3-star SVG pattern (data-URI, ~150 bytes, zero network requests). Applied to: Total Wedding Expenses, Join Code, My Total Contribution heroes
- **Stat cards reborn** — `.stat-card-primary` / `.stat-card-accent` / `.stat-card-success` variants with gradient backgrounds, corner glows, and big icon glyphs (top-right at `opacity: 0.6`, scale + rotate on hover via `--ease-spring`); cards lift on hover
- **Top contributors podium** — `.podium-1/2/3` classes with gold/silver/bronze gradient backgrounds + colored shadow on first place; combined with existing 🥇🥈🥉 emoji avatars, leaderboard now has visual rank
- **Bottom nav active state** — dual signal: subtle `--primary-100` pill background behind icon+label PLUS gradient hairline at top
- All key cards bumped from `--radius-lg` (20px) to `--radius-xl` (28px) — more pillowy modern feel
- `surface-card` lifts on hover (shadow grows)

**JSX polish (every page touched):**
- [LandingPage.jsx](Frontend/src/pages/LandingPage.jsx): bobbing 💒 hero icon, gradient text on title (`background-clip: text`), stagger entrance on CTA buttons, refined wedding selector, `autoComplete` + `inputMode` attributes for password managers and mobile keyboards
- [Dashboard.jsx](Frontend/src/pages/Dashboard.jsx): two-column layout on tablet+ (Categories + Top Contributors side-by-side via `grid-tablet-2`), refined skeleton matching content shape, stat cards with new variants, hero card with sparkle pattern, podium classes on top 3 contributors
- [AddExpense.jsx](Frontend/src/pages/AddExpense.jsx): new animated step indicator, pill-style category chip on amount step, `inputMode="decimal"` for proper mobile keyboard
- [Settings.jsx](Frontend/src/pages/Settings.jsx): preferences row at top combining language + theme toggles, refined modal using new `.modal-backdrop` / `.modal-content` classes
- [MyExpenses.jsx](Frontend/src/pages/MyExpenses.jsx) / [AllExpenses.jsx](Frontend/src/pages/AllExpenses.jsx): hero cards with sparkle, stagger entrance, refined empty states, scroll-snap-style filter chips
- [Members.jsx](Frontend/src/pages/Members.jsx): pill admin badge, refined remove button (square with icon)
- [BottomNav.jsx](Frontend/src/components/BottomNav.jsx): label keys translated via `t('nav.*')`
- [ThemeToggle.jsx](Frontend/src/components/ThemeToggle.jsx): tooltip translated via `t('theme.toLight'/'theme.toDark')`

**Files added:**
- `Frontend/src/i18n/translations.js` — flat-keyed `en` + `hi` dictionaries + `translateServerMessage()`
- `Frontend/src/context/LanguageContext.jsx` — provider with memoized `t()`, `tCat()`, `tServer()`, `toggleLang()`
- `Frontend/src/utils/format.js` — `fmtAmount(n, currency, t)` and `fmtDate(d, lang)`
- `Frontend/src/components/LanguageToggle.jsx` — circular pill toggle matching ThemeToggle

**Files changed:**
- `Frontend/src/main.jsx` — wrapped with `<LanguageProvider>` (outermost so all consumers can use `useLang`)
- `Frontend/index.html` — added Noto Sans Devanagari to Google Fonts URL
- `Frontend/src/index.css` — full rewrite (~560 → ~900 lines)
- All 7 page files + `BottomNav.jsx` + `ThemeToggle.jsx` — refactored to use `t()`

**Edge cases handled:**
- localStorage unavailable (private mode) — `try/catch` guards, defaults to English
- Touch devices — `@media (hover: none)` disables hover transforms (no sticky hover state)
- Reduced motion — `@media (prefers-reduced-motion)` kills all animations
- Server messages on Hindi side — `translateServerMessage()` covers exact + pattern matches; unknown messages fall back to English
- Plurals — singular variants (`*.expenseCountOne`, `*.contributorMetaOne`) for `count === 1` to avoid "1 expenses"
- Devanagari font loading — `display=swap` + Inter as primary so English text never blocks on Devanagari fetch
- All icon-only buttons have `aria-label` (back, theme, language, remove member, password toggle)

**Bundle impact (before → after the full day):**
- CSS: 11.36 KB / 3.20 KB gzipped → **25.36 KB / 6.11 KB gzipped** (+2.91 KB gzipped for full design system + i18n + beautification)
- JS: 338.30 KB / 102.76 KB gzipped → **340.63 KB / 103.27 KB gzipped** (+0.51 KB gzipped — i18n is tiny)
- Build time: ~1s → **~450ms** (Vite cached optimization)
- Zero new dependencies. All animations are pure CSS / GPU-accelerated transform+opacity.

### 2026-05-07 — Default Category Expansion + Smart Migration CTA

Continuation of the same day. User flagged that the default category list was too thin for actual Indian weddings (missing all the pre-wedding ceremonies, post-wedding events, and key services).

**Feature — Expanded default Indian wedding categories (10 → 20):**
- New canonical list curated by usage frequency + cultural universality, ordered for fastest scan:
  - **Most-used core (1-8):** Venue 🏛️, Catering 🍽️, Decoration 💐, Photography 📸, Outfits 👗, Jewelry 💍, Music & DJ 🎵, Makeup & Beauty 💄
  - **Pre-wedding ceremonies (9-12):** Mehendi 🌿, Sangeet 💃, Haldi 🌼, Priest & Pooja 🪔
  - **Logistics (13-17):** Transport 🚗, Invitations 💌, Sweets 🍬, Gifts 🎁, Accommodation 🏨
  - **Post-wedding (18-19):** Reception 🎊, Honeymoon ✈️
  - **Catch-all (20):** Miscellaneous 📦
- 20 chips × 3-col mobile grid = 7 rows. Tablet 4-col = 5 rows. Desktop 5-col = 4 rows. Scrollable but scannable thanks to icons. Deliberately did NOT add search bar or grouping headers (would be clumsy per user's preference).
- Hindi translations added for all 10 new categories using conversational North-Indian forms: मेहंदी, संगीत, हल्दी, पंडित जी, मेकअप, निमंत्रण कार्ड, मिठाई, ठहरने का इंतज़ाम, रिसेप्शन, हनीमून

**Feature — Smart "suggested categories" CTA in Settings:**
- The challenge: existing weddings (created before the expanded list) only have the original 10 categories. The `pre('save')` hook only seeds defaults at wedding creation. Auto-injecting on every fetch would override admins who deleted defaults intentionally. Forcing recreate-or-manually-add is hostile UX.
- The solution: contextual button at top of Settings → Categories that detects missing defaults and offers single-click append. Disappears once all defaults are present. Preserves admin's custom categories. Won't re-add what they intentionally deleted (button reappears, but they can ignore).
- Case-insensitive name matching prevents duplicates from casing differences.
- Pattern is permanent: any future default-list expansion automatically benefits all existing weddings via the same CTA. No migration scripts to run.

**Files added:**
- `Frontend/src/constants/defaultCategories.js` — canonical default list + `getMissingDefaults(currentCategories)` helper. Comment explicitly pairs it with `Backend/models/Wedding.js` as the dual source of truth.

**Files changed:**
- `Backend/models/Wedding.js` — `pre('save')` hook updated to seed 20 categories with grouping comments
- `Frontend/src/i18n/translations.js` — added 10 new `cat.*` keys (en + hi) + 2 new settings keys (`suggestedCategories`, `suggestedCategoriesAdded`)
- `Frontend/src/pages/Settings.jsx` — imports `getMissingDefaults`, renders contextual suggestion button when `missingDefaults.length > 0`

**Edge cases handled:**
- Empty categories array → entire default list returned as missing
- Non-array input to `getMissingDefaults()` → defensive fallback returns full default list
- Case-insensitive matching: "Venue" / "venue" / "VENUE" all considered duplicates
- Toast confirmation after bulk add (`{count} categories added — review and save`) so user knows to hit the existing "Save Categories" button to persist

**Bundle impact:**
- JS: 340.63 KB → **342.98 KB** / 103.27 KB → **104.03 KB gzipped** (+0.76 KB gzipped for constants file + 22 new translation strings + button JSX)
- CSS: unchanged (button reuses existing classes with inline rose-tinted style)
- Build time: ~470ms

### 2026-05-07 — AddExpense Page Production Hardening

**Enhancement — Language/Theme toggle added to AddExpense page:**
- LanguageToggle + ThemeToggle placed in the header row (top-right), matching the Dashboard and Settings pattern
- Header now uses a flex row: back button + title on the left, toggles on the right

**Enhancement — Production-grade edge case handling:**
- **Double-submit guard** — `useRef` flag prevents multiple simultaneous API calls if user taps rapidly
- **Max amount ceiling** — 99,99,99,999 (~100 crore) safety guard against accidental huge entries
- **Input trimming** — description, paidBy, and vendor are trimmed on submit (not during typing — preserves UX)
- **NaN/Infinity guards** — `parseAmount()` rejects non-finite numbers before API call
- **Empty wedding guard** — Renders a loading/empty state if `wedding` context hasn't loaded yet
- **Empty categories guard** — Friendly empty state with hint to ask admin if no categories exist
- **Keyboard Enter support** — Enter on amount field advances to step 3; Enter on detail fields submits
- **Autofocus on step 2** — Amount input auto-focuses with a small delay (lets CSS animation complete first)
- **maxLength on text inputs** — description (200), paidBy (100), vendor (150) prevent excessively long entries
- **Proper HTML attributes** — `min`, `max`, `step="any"` on number input; `autoComplete` hints; `aria-label` on back button and amount input

**Files changed:**
- `Frontend/src/pages/AddExpense.jsx` — Full rewrite with all improvements above
- `Frontend/src/i18n/translations.js` — 5 new keys (en + hi): `add.errAmountMax`, `add.backLabel`, `add.errNoWedding`, `add.noCategories`, `add.noCategoriesHint`

### 2026-05-07 — Receipt Upload via Cloudinary

Pulled forward the P2 receipt upload feature per user request. Chose Cloudinary as storage provider (generous free tier, auto image optimization).

**Feature — Receipt image upload on expense creation:**
- **Backend:** `Backend/utils/cloudinary.js` — config + `uploadToCloudinary(buffer, folder)` + `deleteFromCloudinary(publicId)` utilities
- **Backend:** `expenseRoutes.js` POST now accepts `multipart/form-data` with optional `receipt` file field via multer (memory storage, 5MB limit, image-only filter: JPEG/PNG/WebP/HEIC/HEIF)
- **Backend:** Cloudinary upload auto-optimizes: `quality:auto`, `fetch_format:auto`, `width:1200 crop:limit` — drastically reduces storage + bandwidth
- **Backend:** DELETE route now cleans up Cloudinary asset (fire-and-forget — doesn't block response)
- **Backend:** Graceful fallback: if Cloudinary not configured (missing env vars) or upload fails, expense saves without receipt — no user-facing error
- **Model:** `Expense.js` — added `receiptPublicId` field (for cleanup on delete; `receiptUrl` already existed)
- **Frontend:** AddExpense Step 3 — two-button receipt section: 📷 Take Photo (`capture="environment"` opens rear camera) + 🖼️ Choose Photo (gallery picker)
- **Frontend:** Preview card shows thumbnail + filename + ❌ remove button before submit
- **Frontend:** Sends `FormData` when receipt attached, plain JSON otherwise (existing flow unchanged)
- **Frontend:** `api.js` — `addExpense()` auto-detects FormData and sets `Content-Type: multipart/form-data` + 30s timeout for uploads
- **Frontend:** MyExpenses + AllExpenses — receipt badge (`🧾 Receipt`) on expenses with attached receipts; tapping opens full-screen viewer overlay with backdrop blur
- **CSS:** 6 new classes: `.receipt-btn-group`, `.receipt-btn`, `.receipt-preview-card`, `.receipt-badge`, `.receipt-viewer-backdrop`, `.receipt-viewer-img`
- **i18n:** 11 new keys (en + hi): `receipt.label`, `receipt.takePhoto`, `receipt.choosePhoto`, `receipt.remove`, `receipt.attached`, `receipt.previewAlt`, `receipt.errType`, `receipt.errSize`, `receipt.viewReceipt`, `receipt.badge` + 3 server error translations
- **Package:** `cloudinary` added to backend dependencies

**Edge cases handled:**
- File type validation (client-side + server-side multer filter) — only images, no PDFs
- File size limit: 5 MB (client-side toast + server-side multer 400 error)
- URL.revokeObjectURL cleanup on preview change and component unmount (prevents memory leaks)
- Double-submit guard preserved with receipt flow
- HEIC/HEIF support (iPhones use HEIC by default)
- Cloudinary not configured → graceful skip (logs warning, expense saves normally)
- Cloudinary upload fails → graceful skip (logs error, expense saves without receipt)
- Receipt delete on expense delete is fire-and-forget (never blocks user)

**Files added:**
- `Backend/utils/cloudinary.js` — Cloudinary configuration + upload/delete utilities

**Files changed:**
- `Backend/package.json` — added `cloudinary` dependency
- `Backend/.env` — added `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` placeholders
- `Backend/models/Expense.js` — added `receiptPublicId` field
- `Backend/routes/expenseRoutes.js` — POST: multer + Cloudinary upload; DELETE: Cloudinary cleanup
- `Frontend/src/api.js` — `addExpense()` handles FormData (multipart) with extended timeout
- `Frontend/src/pages/AddExpense.jsx` — receipt capture/gallery UI, preview, FormData submission
- `Frontend/src/pages/MyExpenses.jsx` — receipt badge + full-screen viewer overlay
- `Frontend/src/pages/AllExpenses.jsx` — receipt badge + full-screen viewer overlay
- `Frontend/src/index.css` — receipt upload, preview, badge, and viewer styles
- `Frontend/src/i18n/translations.js` — 11 new receipt keys (en + hi) + 3 server error messages

### 2026-05-07 — Member-Side Wedding Data Freshness Fix

User reported a real production bug: admins could expand the category list via Settings → "Add suggested categories", but **members never saw the new categories** in AddExpense. They were stuck with whatever category list was cached at join time.

**Root cause:**
- `wedding` state in `WeddingContext` was hydrated from `localStorage` on mount
- The auth `useEffect` only called `refreshSummary()` and `refreshMembers()` — `refreshWedding()` was never invoked automatically
- Admin updates via `PUT /api/weddings/current` only refreshed *their own* session (Settings.jsx explicitly calls `refreshWedding()` after save)
- Members reloading the page would re-read stale localStorage data — categories never updated for them

**Fix — Three-layer freshness pattern (industry-standard):**

1. **Layer 1 — Refresh on auth (page load / login):** Added `refreshWedding()` to the auth `useEffect` in `WeddingContext.jsx`. Every login or page reload now pulls fresh wedding state from the server. This is the primary fix.

2. **Layer 2 — Throttled tab-visibility refresh:** New `useEffect` listens for `document.visibilitychange`. When the tab returns to foreground, refreshes wedding + summary. Throttled via `useRef` to **15-second minimum** between visibility-triggered refreshes — prevents API spam from rapid tab toggles. Same pattern used by Slack, Notion, Gmail.

3. **Layer 3 — Refresh on AddExpense mount:** Defense-in-depth at the exact moment categories matter most. Catches the same-session case where admin edits categories while member is on Dashboard, then taps AddExpense. Single-shot `useEffect` with empty deps.

**Why three layers, not one:** Single point of failure is bad practice. Each layer covers a different scenario:
- Member reloads page → Layer 1
- Member returns to backgrounded tab → Layer 2
- Admin updates while member browses → Layer 2 + Layer 3
- Member taps "Add Expense" in fresh session → Layer 1 + Layer 3

If any one layer fails (network blip, browser quirk), the others cover it.

**Edge cases handled:**
- Throttle uses `useRef` (no re-render trigger), tracks last refresh timestamp
- Visibility handler cleaned up via `removeEventListener` in `useEffect` return — no memory leaks
- `refreshWedding()` already early-returns on `!isAuthenticated`; visibility handler also gates by it
- Existing `try/catch` in refresh callbacks logs but doesn't crash; member keeps cached data on transient failures
- Stale category at submit time (admin removed category X mid-session) → backend's `expenseRoutes.js` validation rejects with clear message; member sees toast, picks again
- Member removed by admin → existing `protect` middleware returns 401 → axios interceptor logs them out (unchanged, already correct)

**Deliberately NOT done:**
- No WebSockets / SSE for realtime sync — overkill, adds infrastructure complexity, conflicts with §4 "boring infrastructure" principle
- No polling — wasteful; visibility-based refresh covers the same need at zero idle cost
- No optimistic UI for member-side category changes — admin's local update already works via Settings, members see updates within seconds of focus

**Files changed:**
- `Frontend/src/context/WeddingContext.jsx` — imported `useRef`, added `refreshWedding()` to auth useEffect, added throttled visibility-change handler with `VISIBILITY_REFRESH_THROTTLE_MS = 15_000` constant
- `Frontend/src/pages/AddExpense.jsx` — destructured `refreshWedding` from `useWedding()`, added one-shot mount effect to call it

**Bundle impact:**
- JS: 342.98 KB → **345.73 KB / 104.79 KB gzipped** (+0.76 KB gzipped — most of which is the existing intentional AddExpense.jsx improvements; the freshness logic itself is ~30 lines)
- CSS: unchanged
- Build time: ~1.18s

**Architectural pattern established:** The three-layer freshness model is now the canonical pattern for any cached server state in this app. Future caches (e.g., wedding settings, member list) should use the same pattern. The visibility-change listener in WeddingContext can be extended to refresh additional data sources without adding another listener.

### 2026-05-07 — Expense Detail Sheet (bottom-sheet popup)

User requested that clicking any expense should open a summary popup showing full details + receipt. Previously expense items were view-only text; now they're fully interactive.

**Feature — `ExpenseDetailSheet` reusable component:**
- Semi-fullscreen bottom sheet on mobile (slides up from bottom, 88vh max), centered modal on desktop (≥720px)
- **Hero section:** Large category icon + category name + formatted amount
- **Description quote:** Italic text with pink left-border accent (only shown if description exists)
- **Detail rows:** Each with emoji icon + uppercase label + value: Date & Time, Paid By, Added By, Vendor, Category
- **Receipt section:** Embedded receipt image with rounded card (only shown if `receiptUrl` exists)
- **Action buttons:** Close + Delete (delete only shown when `onDelete` prop is provided)
- **Backdrop:** Blurred overlay, click-to-dismiss, Escape key to close, body scroll lock while open

**Integration across 3 pages:**
- `Dashboard.jsx` — Recent Activity items now clickable → opens detail sheet (read-only, no delete)
- `MyExpenses.jsx` — All expense items clickable → opens detail sheet with Delete button
- `AllExpenses.jsx` — All expense items clickable → opens detail sheet, Delete only for admins
- Delete buttons removed from the list view (moved into sheet for cleaner UX)

**Files added:**
- `Frontend/src/components/ExpenseDetailSheet.jsx` — Reusable bottom-sheet component

**Files changed:**
- `Frontend/src/pages/Dashboard.jsx` — Import + state + clickable expense items + sheet render
- `Frontend/src/pages/MyExpenses.jsx` — Replaced receipt-only viewer with ExpenseDetailSheet
- `Frontend/src/pages/AllExpenses.jsx` — Replaced receipt-only viewer with ExpenseDetailSheet
- `Frontend/src/index.css` — ~200 lines of new CSS: sheet backdrop, container, scale animation, hero, description quote, detail rows, receipt section, actions
- `Frontend/src/i18n/translations.js` — 7 new keys (en + hi): `detail.date`, `detail.paidBy`, `detail.addedBy`, `detail.vendor`, `detail.category`, `detail.receipt`, `detail.close`

### 2026-05-07 — Receipt Upload Silent Failure Fix (superseded — see 2026-05-08)

**Bug:** Users uploaded receipts, but the expenses saved without them, and no error was shown.
**Root cause (initial diagnosis):** The Axios instance (`api.js`) was configured with a default `headers: { 'Content-Type': 'application/json' }`. When passing a `FormData` object, Axios did not automatically delete this default header. As a result, the browser sent the payload as `application/json` instead of `multipart/form-data`, meaning no `boundary` was generated. The backend `multer` middleware silently ignored the payload, leaving `req.file` undefined.
**Attempted fix (did NOT actually work):** Explicitly passed `headers: { 'Content-Type': undefined }` in the API call when `FormData` is detected. **This was incorrect** — the real diagnosis and fix landed on 2026-05-08.

### 2026-05-08 — Receipt Upload Real Fix + Upload-Progress UX + Backend Warning Field

User retested receipt uploads and confirmed the 2026-05-07 fix did not work. Investigated end-to-end and found the *actual* root cause.

**True root cause — two layers deep:**

1. **Axios `mergeConfig` does NOT delete on `undefined`.** In Axios 1.x, `mergeDeepProperties` (lib/helpers/mergeConfig.js) checks `!utils.isUndefined(b[prop])` before applying the per-request value. When the per-request header is `undefined`, the *first branch is skipped* and the default (`application/json`) is preserved through the merge. So `headers: { 'Content-Type': undefined }` silently does nothing.

2. **Axios's default `transformRequest` mangles FormData when Content-Type is JSON.** Code path in `lib/defaults/index.js`:
   ```js
   if (isFormData) {
     return hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data;
   }
   ```
   When `Content-Type` ends up as `application/json` (because of #1) and the body is FormData, Axios calls `formDataToJSON(data)` which converts entries to a plain object. **`File` objects don't survive `JSON.stringify` — they serialize as `{}`.** The wire payload becomes `{ category: "...", amount: "...", ..., receipt: {} }` sent as `application/json`.

This explains every symptom:
- Text fields save (Express's `express.json()` parses the JSON body successfully).
- File silently lost (multer sees `application/json`, declines to run, `req.file` stays undefined).
- No error, 200 OK — backend's graceful skip in `if (req.file && isCloudinaryConfigured())` was never reached because there was nothing to error on.

**Fix — Option A: drop the global default Content-Type entirely.**

Removed `headers: { 'Content-Type': 'application/json' }` from `axios.create()`. Axios 1.x infers per-request based on data type:
- plain object → `application/json`
- FormData → `multipart/form-data; boundary=…` (browser auto-injects boundary)
- URLSearchParams → `application/x-www-form-urlencoded`

The flaky `'Content-Type': undefined` workaround in `addExpense()` was deleted. The function now also accepts an `onUploadProgress` callback for live byte-level progress.

**Backend — partial-success warning:**

Silent receipt failures are a UX trap (user assumes their receipt is attached). The POST `/api/expenses` route now returns a `warning` field in the JSON response when:
- Cloudinary is not configured (env vars missing) but a file was sent
- Cloudinary upload threw (bad credentials, network, quota, etc.)

The expense itself still saves — receipt is optional and we don't want to lose the user's form input. The frontend surfaces the warning as a non-success toast (⚠️ icon, 5s) so the user knows to delete and re-create if they truly need the receipt attached.

**AddExpense.jsx — production-grade upload UX:**
- New states: `phase` ('uploading' | 'finalizing' | null) and `uploadPercent` (0–100)
- Submit button label cycles: `Save Expense` → `📤 Uploading 47%...` → `⏳ Finalizing...` → toast
- Live gradient progress bar appears beneath the button while bytes are in flight (`role="progressbar"` + ARIA value attrs)
- Camera, gallery, and remove-receipt buttons all `disabled={loading}` during upload (prevents mid-flight tampering)
- Partial-success warning routed through `tServer()` so Hindi users see the translated message
- Multipart timeout: 60s (vs 15s for JSON) — covers slow networks + Cloudinary roundtrip

**Files added:**
- *(none)*

**Files changed:**
- `Frontend/src/api.js` — removed global Content-Type default, simplified `addExpense()`, added `onUploadProgress` parameter
- `Backend/routes/expenseRoutes.js` — POST returns `warning` field when receipt upload skipped/failed (no longer silent)
- `Frontend/src/pages/AddExpense.jsx` — phase/percent states, progress bar, button label cycle, locked controls during loading, warning toast routing
- `Frontend/src/i18n/translations.js` — 2 new keys (`add.uploadingProgress`, `add.finalizing`) × en + hi; 2 server-message translations for the warning strings

**Edge cases handled:**
- `e.total` undefined on progress event → guarded; skips silently
- Bytes reach 100% but server still processing → label switches from `Uploading` to `Finalizing` automatically
- Network timeout mid-upload → axios rejects, warning toast via tServer, form preserved
- User picks file → server rejects mime → multer's wrapped error returns clean 400 with translated message
- Cloudinary unconfigured (dev mode missing creds) → expense saves with warning, no crash
- Cloudinary upload throws → expense saves with warning
- Existing JSON-only routes (createWedding, login, etc.) — Axios still sends `application/json` correctly because plain objects auto-resolve to JSON Content-Type per request

### 2026-05-08 — Full-Screen Receipt Viewer (zoom + pan + download)

Receipt thumbnails in the ExpenseDetailSheet were view-only. User requested full-screen viewing with zoom, pan, and download. Built a custom viewer instead of pulling in a library — fits the project's "pure CSS animations, zero motion-lib deps" principle and gave more control over the gesture model.

**Feature — `ReceiptViewer` component:**
- Full-screen modal rendered via `createPortal(…, document.body)` at `z-index: 10001` (above ExpenseDetailSheet's 10000)
- **Always-dark surface** (regardless of app theme) — image viewing UX standard
- Top action bar: Download + Close icon buttons (44px touch targets, glassmorphic pill background)
- Bottom zoom bar: − / [percentage] / + segmented pill (tapping the percentage resets zoom)
- Image stage handles all gestures via Pointer Events API (unifies mouse + touch + pen)

**Gesture model — implemented from scratch using Pointer Events:**
- **Pinch zoom** (mobile, 2 fingers): tracks distance ratio between pointers, multiplies starting scale
- **Wheel zoom** (desktop): `passive: false` listener so `preventDefault` stops page scroll while zooming
- **Double-tap / double-click**: toggles 1× ↔ 2.5× (300ms detection window)
- **Drag-to-pan** when zoomed: clamped via `clampTranslate()` so image cannot leave viewport at any scale
- **Pinch → drag transition**: lifting one finger mid-pinch cleanly transitions to drag mode if still zoomed
- **Keyboard**: `+` / `-` zoom, `0` reset, `Esc` close
- Scale bounds: `[1, 5]`. Re-clamps translate whenever scale changes.

**Performance — imperative DOM transforms during gestures:**
- `liveRef` holds `{ scale, x, y }` and the image's `style.transform` is mutated directly via ref on each pointer event — no React re-render on every pointermove
- React state syncs only at gesture end so the % readout in the zoom bar updates
- `transform: translate3d(…) scale(…)` for GPU compositing, `will-change: transform`, `transform-origin: center center`
- Result: 60fps pinch/pan even on low-end Android

**Download — Cloudinary `fl_attachment` URL transform:**
- New helper: `buildDownloadUrl(receiptUrl, filename)` inserts `fl_attachment:<safe-filename>,f_jpg` after `/upload/` in the Cloudinary URL
- `fl_attachment` makes the browser download the file (sets `Content-Disposition: attachment`) instead of displaying inline
- `f_jpg` forces JPG output regardless of source format — HEIC/WebP receipts download as JPG so they open in any image viewer (no client-side conversion)
- Filename derived from `receipt-<category>-<expense-id-suffix>`; sanitized to `[a-zA-Z0-9_-]`, capped at 60 chars
- For non-Cloudinary URLs (future-proof) → falls back to plain anchor download
- Triggers via dynamically-created `<a>` element with `download` + `target="_blank"` (handles browsers that block programmatic same-tab download); on failure, opens new tab + toast hint

**Body / scroll handling:**
- Saves `window.scrollY`, applies `position: fixed; top: -<scroll>px` to body, restores on unmount → no jump-back-to-top
- `touch-action: none` on backdrop prevents native pinch-zoom + pull-to-refresh from competing with our handlers
- `overscroll-behavior: contain`
- `setPointerCapture` so pointermove fires even when finger leaves the image bounds
- Re-measures fitted image dims on `resize` / `orientationchange`

**Integration:**
- ExpenseDetailSheet's receipt thumbnail is now a `<button>` with `cursor: zoom-in` and a "🔍 Tap to zoom" pill badge bottom-right (subtle hover affordance)
- Tapping opens ReceiptViewer; sheet's own Esc handler is gated by `viewerOpen` state so a single Esc closes only the topmost layer
- Used by Dashboard, MyExpenses, and AllExpenses transitively (they all render ExpenseDetailSheet)

**Files added:**
- `Frontend/src/components/ReceiptViewer.jsx` — full-screen viewer with pointer-event gesture handling, Cloudinary download URL builder, loading/error states

**Files changed:**
- `Frontend/src/components/ExpenseDetailSheet.jsx` — receipt thumbnail wrapped in button, ReceiptViewer mounted, Esc gating to avoid double-close
- `Frontend/src/index.css` — replaced legacy 4-class `.receipt-viewer-*` block with full viewer system (~150 lines): backdrop, stage, top bar, zoom bar, icon button (shared), spinner, error state. Added `.sheet-receipt-img-btn` clickable thumbnail with hover-lift + bottom-right zoom hint pill. Reduced-motion media query.
- `Frontend/src/i18n/translations.js` — 9 new keys (en + hi): `receipt.tapToZoom`, `receipt.viewerTitle`, `receipt.zoomIn`, `receipt.zoomOut`, `receipt.resetZoom`, `receipt.download`, `receipt.downloadFallback`, `receipt.errLoad`

**Edge cases handled:**
- Image fails to load → ⚠️ error state with translated message (`receipt.errLoad`)
- Loading state → spinner overlay until `<img onLoad>` fires; image is `visibility: hidden` until loaded to avoid broken-image flash
- Pan bounds recomputed via `clampTranslate(translate, scale, viewportSize, fittedSize)` whenever scale changes — image cannot drift off-screen
- `transform-origin: center center` keeps zoom centered (would need cursor-relative math for "zoom to cursor"; intentionally simpler)
- Download anchor click blocked by browser → fallback opens new tab with toast hint (`receipt.downloadFallback`)
- Filename special characters → sanitized to safe set, capped at 60 chars (Cloudinary limit-friendly)
- `prefers-reduced-motion` → all animations skipped
- Safe-area insets on iPhone notch / home indicator (`env(safe-area-inset-top/bottom)`)
- Min 44×44 px touch targets (WCAG)
- `aria-modal="true"`, `role="dialog"`, `aria-label` on viewer; `aria-label` + `title` on every icon button
- Two-finger drag without zoom → still tracked as pinch (handles user lifting one finger to switch to drag)
- Double-tap on a non-zoomed image while another tap was recent → toggles zoom; tap counter resets to prevent triple-tap chains
- Window resize / orientation change → re-measures so pan bounds stay correct
- Z-index 10001 places viewer above ExpenseDetailSheet (10000); both rendered via `createPortal` so neither is constrained by parent transforms

**Deliberately NOT done:**
- No third-party zoom library (`react-medium-image-zoom`, `lightgallery`, `yet-another-react-lightbox`) — all add 5–15 KB gzipped and lack one of: pan, download, custom UI fit. Custom implementation is ~3 KB and matches the design system exactly.
- No "zoom to cursor" math (zoom always centered) — adds complexity for marginal UX win on a receipt viewer
- No client-side HEIC→JPG conversion — Cloudinary's `f_jpg` URL flag does it server-side at zero client cost
- No blob-fetch download path — Cloudinary `fl_attachment` makes it unnecessary; avoids CORS issues and double-bandwidth

**Bundle impact (since 2026-05-07 EOD):**
- JS: 345.73 KB / 104.79 KB gzipped → **364.71 KB / 109.58 KB gzipped** (+4.79 KB gzipped: receipt viewer + upload-progress logic + warning routing)
- CSS: 25.36 KB / 6.11 KB gzipped → **34.19 KB / 7.59 KB gzipped** (+1.48 KB gzipped: receipt viewer styles + clickable thumbnail)
- Build time: ~420ms
- Zero new dependencies. Pointer Events API is universally supported (Chrome/Edge/Safari/Firefox/iOS Safari).

**Architectural note — the gesture pattern is reusable.** The `liveRef` + imperative-transform-during-gesture + state-sync-at-end pattern is the canonical answer for any future high-frequency interaction (e.g., draggable budget slider, swipe-to-delete on expense rows). Don't setState in pointermove handlers — mutate refs and apply via DOM directly.

### 2026-05-23 — Deploy Prep + Production Google Auth + Security Audit + Password Reset + CSP

A P1-focused session: prepared the app for always-on deployment, then hardened the entire login/auth/authz surface to production grade. Five threads of work.

**Feature — PWA / deploy Phase A (HTTPS prerequisite for installable PWA):**
- Chose **Vercel (frontend) + Railway (backend)**; MongoDB Atlas unchanged. Decision: ship as an installable **PWA first**, wrap with Capacitor for app stores only after P0 validates (matches §8 P1 "PWA support" + §10 "PWA may suffice").
- `Backend/Procfile` (`web: node server.js`); Railway **Root Directory = `Backend`** (monorepo — Railpack fails at repo root with no package.json).
- **List-aware CORS** (`server.js`) — `FRONTEND_URL` is now comma-separated (prod + Vercel preview origins); added `X-Idempotency-Key` to the allowlist (for a future offline-queue Phase C).
- **Env-driven API base URL** — `api.js` uses `import.meta.env.VITE_API_URL`, falling back to `/api` (Vite proxy) for local dev. Added `Frontend/vercel.json` (SPA fallback that excludes `/sw.js`, `/manifest.webmanifest`, static assets; cache headers).
- Added `Backend/.env.example` and `Frontend/.env.example` (the missing `Frontend/.env` with `VITE_GOOGLE_CLIENT_ID` was the reason the Google button never rendered).

**Feature — Production-grade Google Sign-In (resolves §11 risk #4):**
- **New `Backend/utils/googleVerify.js`** — verifies the Google ID token against Google's public keys via `google-auth-library` (`OAuth2Client.verifyIdToken`): signature + **audience (our `GOOGLE_CLIENT_ID`)** + issuer + expiry + `email_verified`. Replaces the old insecure base64-decode that trusted forged tokens.
- Backend now needs `GOOGLE_CLIENT_ID` (same value as frontend `VITE_GOOGLE_CLIENT_ID`). Fails safe with `503` if unset — never accepts unverified tokens.
- **Sign in + Join via Google + Create-wedding via Google** all wired. `POST /weddings` accepts either email+password or `googleCredential`. Login query no longer filters by `authProvider` so a local user who links Google keeps password login.
- Frontend: reusable `GoogleAuthButton` (polls until the `async defer` GSI script is ready — fixes a silent race where the button never rendered; loading/ready/unavailable states; `outline` theme for light+dark). Google now appears on Hero (one-tap returning-user sign-in), Login, Join, and Create.

**Feature — Security audit + fixes (full login/auth/authz review):**
- 🔴 **CRITICAL — Join-flow account takeover (fixed).** `POST /weddings/join` matched the member name via a **raw user string interpolated into `new RegExp()`** and then logged in *any* matching member — so anyone with the (widely-shared) join code could become the **admin** by typing their name, or `.*` to match the first member. Fix: name is **escaped/matched literally**, and name-based re-entry is now restricted to **passwordless `member` accounts** — accounts with a password / email / Google / admin role must use Login (returns `409`, frontend auto-routes them to Login).
- 🟠 **`trust proxy`** set (`app.set('trust proxy', 1)`) — rate limiting was broken behind Railway's proxy (everyone shared one IP / X-Forwarded-For spoofable).
- 🟠 **NoSQL operator sanitizer** — new `Backend/middleware/sanitize.js` strips keys starting with `$` or containing `.` from body/query/params (blocks `?category[$ne]=…` style operator injection). Added type guards on login/join inputs.
- 🟠 **User-enumeration fixed** — login now returns one generic *"Incorrect email or password"* for both unknown-email and wrong-password.
- 🟡 **Edit-category validation** — `PUT /expenses/:id` now validates the new category against the wedding's list (create already did).
- Verified solid (no change needed): wedding-scoped isolation on every query, no mass-assignment (`role`/`weddingId`/`memberId` always server-set), owner-or-admin checks on expense edit/delete, `protect` re-checks `isActive` each request, bcrypt rounds 12, strong 128-char JWT secret, `toJSON` strips secrets.

**Feature — Content-Security-Policy + security headers (resolves §11 M4):**
- `vercel.json` now sets a strict **CSP** on the production document: `script-src 'self' https://accounts.google.com/gsi/client` (no `unsafe-inline` — the Vite build has zero inline scripts), `style-src 'unsafe-inline'` (React inline styles + Google Fonts), `img-src` for Cloudinary + Google avatars, `connect-src` for the API + GSI, `frame-src` for the GSI button, plus `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action 'self'`.
- Also: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `HSTS`. (Dev/Vite is intentionally CSP-free — Vite HMR needs looser rules.)

**Feature — Email-based password reset (resolves §11 risk #3):**
- **New `Backend/utils/email.js`** — provider-agnostic SMTP via `nodemailer` (Resend/SendGrid/Gmail/Mailtrap). If SMTP isn't configured, the reset link is **logged to the server console** (dev-testable without an email account); never throws.
- `Member.js` gains `resetPasswordToken` (sha256 hash, `select:false`) + `resetPasswordExpires` (1 h), both stripped from `toJSON`.
- `POST /auth/forgot-password` — always returns a generic success (anti-enumeration); stores the hashed token on every account sharing the email; emails the link. `POST /auth/reset-password` — verifies hashed token + expiry, sets the new password on all password-holding accounts with that email (multi-wedding consistency), clears tokens. Both rate-limited under `/auth`.
- Frontend: "Forgot password?" on Login → `ForgotPasswordForm` ("check your email" state) → email link opens new public route **`/reset-password`** (`ResetPasswordPage`) with show/hide + match validation. Full en + hi translations.

**New env vars:** `GOOGLE_CLIENT_ID` (backend), `SMTP_HOST/PORT/USER/PASS/FROM` (backend, optional), `VITE_GOOGLE_CLIENT_ID` + `VITE_API_URL` (frontend; set in Vercel dashboard since `.env` is gitignored).

**New dependencies:** `google-auth-library`, `nodemailer` (backend).

**Files added:** `Backend/Procfile`, `Backend/utils/googleVerify.js`, `Backend/utils/email.js`, `Backend/middleware/sanitize.js`, `Backend/.env.example`, `Frontend/vercel.json`, `Frontend/.env` + `Frontend/.env.example`, `Frontend/src/pages/ResetPasswordPage.jsx`.

**Files changed:** `Backend/server.js` (trust proxy, list CORS, sanitizer), `Backend/routes/authRoutes.js` (Google verify, enumeration fix, reset routes), `Backend/routes/weddingRoutes.js` (join takeover fix, create-via-Google), `Backend/routes/expenseRoutes.js` (edit-category validation), `Backend/models/Member.js` (reset fields), `Frontend/src/api.js` (env URL, forgot/reset), `Frontend/src/App.jsx` (reset route), `Frontend/src/pages/LandingPage.jsx` (GoogleAuthButton, hero Google, forgot-password), `Frontend/src/i18n/translations.js`.

### 2026-05-24 — AllExpenses Redesign & Frontend TypeScript Migration

**Session focus:** Major UI overhaul of the AllExpenses view for professional scalability, followed by migrating the entire React frontend to strict TypeScript.

**Feature — AllExpenses Table Redesign (`AllExpenses.tsx`, `index.css`):**
- **Root Cause:** The old card-based list wasted vertical space and lacked column alignment, making it hard to scan many expenses. The mobile view had formatting issues and an unprofessional "Total on this page" text.
- **Fix:** Implemented a dual responsive layout. Mobile (<720px) uses a structured grid list with a sticky header, alternating row backgrounds, and a compact receipt dot indicator. Desktop (≥720px) uses a semantic `<table>` with 7 aligned columns, a glass `<thead>`, hover effects, and continuous serial numbers. Replaced the generic "Total on this page" with a premium Hero stat bar that calculates the page-level total client-side.
- **Impact:** Professional, highly scannable, data-dense view that elegantly handles both mobile screens and large monitors.

**Enhancement — Frontend TypeScript Migration:**
- **Context:** The frontend codebase had scaled to a point where implicit types and loose prop definitions in `.jsx` were slowing down development and risking runtime errors.
- **Implementation:** Renamed all `.js`/`.jsx` files to `.ts`/`.tsx`. Defined core interfaces (`Wedding`, `Expense`, `Member`, `Category`) in `src/types/index.ts`. Fully typed Context Providers (`WeddingContext`, `LanguageContext`), API responses (`api.ts`), and utility functions. Fixed missing types in components (`ThemeToggle`, `ExpenseDetailSheet`). Cast `window.google` to handle async GSI library injection safely.
- **Impact:** `npx tsc --noEmit` now passes with 0 compilation errors. Type safety across the entire client, catching interface mismatches (e.g., `coupleNames` struct vs string) at build time.

**Feature — Professional Sortable/Filterable Table Header (`SortableFilterableTableHeader.tsx`):**
- **Context:** The previous header was bulky, relied heavily on Tailwind classes (which are not used elsewhere in this project's custom CSS architecture), and took up too much vertical space. Tooltips were getting clipped due to `overflow: hidden` and stacking context issues (`backdrop-filter`).
- **Implementation:** Rebuilt the component to be zero-dependency and perfectly aligned with the premium BharatForce SaaS design pattern. Removed Tailwind and injected scoped CSS directly into `index.css`/`AllExpensesTable.css`.
- **UX Polish:** Icons gracefully disappear unless hovered. Tooltips are dynamically promoted to `z-index: 10` on hover to prevent clipping. Removed container `overflow: hidden` to allow absolute popovers to break out of the table bounds safely.

**Fix — Seamless Table Refresh & Empty States (`AllExpenses.tsx`):**
- **Root Cause:** Re-running the filter logic or fetching new data caused the entire table to unmount and remount due to `loading` boolean toggles, causing jarring flashes and preventing users from clicking "Clear Filters" when a search yielded 0 results.
- **Fix:** Introduced an `isFetching` state that dims the table (`opacity: 0.6` + `pointer-events: none`) while preserving the DOM. The table now stays mounted when empty, showing a graceful "No matching expenses" state that allows the user to click the search bar and clear their filters.

**Fix — Theme FOUC & Initialization Logic (`main.tsx`):**
- **Root Cause:** The `ThemeToggle` component was responsible for reading the theme from localStorage and applying it to the HTML element. However, pages without the toggle (like `AllExpenses`) would render in the default dark mode on hard refresh, causing a logic gap.
- **Fix:** Moved the theme initialization script to the very top of `main.tsx` (pre-render execution). The theme is now forcefully injected before React even boots, permanently solving the dissimilarity logic gap and preventing Flash of Unstyled Content (FOUC).

**Feature — Landing / Auth page redesign (split-screen premium sign-in) (`LandingPage.tsx`, `index.css`, `translations.ts`):**
- **Context:** The old landing hero was "basic and normal"; the owner wanted the higher bar of a separate SaaS (BharatForce) login. Adapted that *pattern language* — not its corporate look — to this app's warm rose/violet glass identity.
- **Implementation:** A new `.auth-*` layout system: an architectural background **watermark** (`WEDDING` / `EXPENSE`, giant tilted, fixed to viewport), a **brand panel** (floating emblem + glow ring + drifting accents, a live **status pill** with a pinging dot, bold gradient headline, tagline, trust chips) beside a **glass auth card**. Desktop shows the two side-by-side (`@media ≥992px`); mobile/tablet stack to a single centred column. The card also wraps every form (Create/Join/Login/Forgot/Select) for one consistent surface. Google button width is locked to the card so it can't look loose. New bilingual strings (`landing.eyebrow`, `landing.trust*`, `landing.panelTitle/panelSubtitle`).
- **Verification:** Rendered device-accurate via Chrome DevTools Protocol (`Emulation.setDeviceMetricsOverride`) across mobile/tablet/desktop + light/dark — a plain `--screenshot` lies because headless `--window-size` ≠ CSS viewport.

**Fix — Forms not scrolling (production-critical) (`index.css`):**
- **Root Cause:** Two compounding bugs. (1) The desktop rule `.auth-panel { flex: 0 0 420px }` was meant to set the hero card's *width* in the horizontal split, but the standalone form panel lives in the shell's *vertical* flex — so `420px` became a locked **height**, cramming the tall Create form into a 420px box. (2) `.auth-shell { overflow: hidden }` (added to clip the watermark) then clipped the overflow and disabled page scrolling, so the rest of the form was unreachable.
- **Fix:** Scoped the width rule to `.auth-hero .auth-panel` (so it only governs the split card's width); standalone form panels now take natural content height. Replaced `overflow: hidden` with `overflow-x: clip` on the shell (clips the watermark horizontally, keeps vertical page scroll) and pinned the watermark with `position: fixed`. Widened desktop form panels to 480px. Verified via CDP that `scrollHeight > innerHeight` and the panel top is not clipped on both desktop and mobile.

**Enhancement — `LandingPage.tsx` fully typed + typecheck gate (`LandingPage.tsx`, `types/index.ts`, `package.json`):**
- Added shared `AuthResult` + `WeddingOption` interfaces to `src/types/index.ts`; typed every component's props, state generics, and cross-boundary handlers (no implicit `any` left in this file). Used `SyntheticEvent` (React 19 deprecates the bare `FormEvent`). Added an `npm run typecheck` (`tsc --noEmit`) script as a production gate — currently passes with **0 errors** across the client.

### 2026-05-24 (cont.) — Expense-List Performance Hardening, Lint/TS Cleanup, MyExpenses Redesign & Browser Smoke Test

A follow-on session the same day: production-hardened the new table feature, fixed the TypeScript-era lint setup, extended the table UX to MyExpenses, and verified everything in a real browser.

**Fix — AllExpenses fetch optimization (`AllExpenses.tsx`, `api.ts`):**
- **Root cause:** every sort/filter header click fired an immediate `GET /api/expenses`. Express's default ETag means each "304" *still* ran the full Mongo `find` + `countDocuments`, so rapid clicks = real DB load. A second latent bug double-fetched on pages ≥ 2 (a separate `setPage(1)` effect re-triggered the fetch after a stale-page fetch had already fired). No request cancellation meant out-of-order responses could overwrite the table with stale rows.
- **Fix:** a single debounced + cached + abortable `useEffect` keyed on a stable `queryKey` derived from filter/page/sort/search. First load fires immediately; subsequent changes debounce 300 ms, collapsing rapid clicks/keystrokes into one request.
- Page reset moved into the same state update as the sort/filter change (via `useCallback`-wrapped setters) — eliminates the double-fetch.
- `AbortController` cancels superseded in-flight requests (cuts server work + fixes the out-of-order race). `getExpenses(params, signal)` now forwards an `AbortSignal`.
- Per-mount in-memory cache (keyed by query, 30 s TTL) serves repeat views instantly with zero network/DB; cleared on delete + force-refetched via a `reloadToken`.
- Edge cases: out-of-range page clamp after deleting the last row on the last page; StrictMode dev double-fetch now collapses to one; skeleton vs dim-overlay states preserved.

**Enhancement — TypeScript ESLint parser + react-hooks@7 / react-refresh refactor (8 files):**
- `eslint.config.js` was never wired for TS after the migration — ESLint parse-errored on *every* `.ts/.tsx`. Wired in `typescript-eslint` (parser + recommended) + a Node block for config files; `@typescript-eslint/no-explicit-any` off (intentional `any` for API payloads; `tsc` enforces real safety).
- That surfaced 8 errors + 3 warnings (all pre-existing, newly visible). **Refactored to fix, not downgraded:**
  - `SortableFilterableTableHeader.tsx`: hoisted `SortIcon` to module scope (`static-components`); replaced the prop→state sync `useEffect` with React's render-time "adjust state when a prop changes" pattern (`set-state-in-effect`).
  - `LandingPage.tsx`: moved the latest-ref write into an effect (`refs`); derived the initial Google-button `status` from the env var instead of an effect.
  - `MyExpenses.tsx`: restructured the mount fetch (AbortController + deferred trigger) so no setState runs synchronously in the effect body.
  - `WeddingContext.tsx` / `LanguageContext.tsx`: split each into context+hook (kept in place) and a new Provider file (`WeddingProvider.tsx`, `LanguageProvider.tsx`) to satisfy `react-refresh/only-export-components` — only `main.tsx` imports changed; all 20+ `useWedding`/`useLang` consumers untouched. WeddingProvider's auth-bootstrap effect deferred via `setTimeout` so the refreshers' setState no longer trips `set-state-in-effect`.
  - `Dashboard.tsx` / `Members.tsx`: added the stable context callback to `useEffect` deps (`exhaustive-deps`).
  - Removed a dead `jsx-a11y` eslint-disable (plugin never installed — was erroring) + two unused `catch` bindings.
- Result: `npm run lint` → **0 problems**, `tsc --noEmit` → 0 errors, `vite build` green.

**Feature — MyExpenses redesign (`MyExpenses.tsx`, `translations.ts`):**
- Brought the AllExpenses table experience to MyExpenses: hero total, category chips, and the same sortable/searchable headers (Category + Description sort+search; Date + Amount sort) on desktop; mobile card view preserved. "Added By" column dropped (single member).
- All sorting/filtering is **client-side** via `useMemo` — `/expenses/my` already returns the member's full list in one call, so header interactions make **zero** additional API calls (instant, and structurally immune to the original API-spam problem). No pagination needed for a personal list.
- Chips derived only from categories the member has actually used (no dead filters). Optimistic delete (instant row removal + hero-total adjust, background `refreshSummary`). Hindi-aware category search/sort. "Showing X of Y · Clear filters" indicator + dedicated filtered-empty state.
- 3 new bilingual i18n keys: `my.emptyFiltered`, `my.clearFilters`, `my.showingFiltered`.

**Verification — headless-Chrome CDP smoke test:**
- Drove the running dev app (Vite :5173 + Express :5000 + MongoDB) with a real token via Chrome DevTools Protocol (Node 22 global `WebSocket`), against a throwaway test wedding created via the API and **deleted afterward** (left zero DB residue).
- **7/7 checks passed, 0 console errors, 0 page exceptions:** landing renders (provider split OK), Dashboard renders with live data, MyExpenses redesigned table renders, client-side sort (Amount asc) + chip filter (Catering → 1 row) work, AllExpenses renders + server-sort click no crash. Screenshots confirmed the redesign visually.
- Only unverified flow: real **Google Sign-In** click-through (needs Google OAuth popup + prod authorized origins) — the button area itself renders fine.

**Files added:** `Frontend/src/context/WeddingProvider.tsx`, `Frontend/src/context/LanguageProvider.tsx`.

**Files changed:** `Frontend/eslint.config.js`, `Frontend/src/api.ts`, `Frontend/src/pages/AllExpenses.tsx`, `Frontend/src/pages/MyExpenses.tsx`, `Frontend/src/UI/SortableFilterableTableHeader.tsx`, `Frontend/src/pages/LandingPage.tsx`, `Frontend/src/context/WeddingContext.tsx`, `Frontend/src/context/LanguageContext.tsx`, `Frontend/src/main.tsx`, `Frontend/src/pages/Dashboard.tsx`, `Frontend/src/pages/Members.tsx`, `Frontend/src/components/ReceiptViewer.tsx`, `Frontend/src/i18n/translations.ts`.

**Architectural note:** the debounced + abortable + query-keyed-cache effect is now the canonical pattern for paginated/server-driven list fetches; client-side `useMemo` sort/filter is the pattern when the full dataset is already loaded (MyExpenses). The context split (context+hook in `XContext.tsx`, provider in `XProvider.tsx`) is the canonical layout for any future React context.

### 2026-05-24 (cont.) — Production Latency Fixes + Premium Loader (skeleton → gradient ring)

Owner reported that in **production** both expense tabs (MyExpenses, AllExpenses) take a noticeably long time to load *even with very little data*, and asked to replace the skeleton with a nicer animated loader.

**Diagnosis — it's latency (round-trips), not data volume.** Queries are already indexed, `.lean()`, and paginated; the cost was network round-trips multiplied by the Vercel ↔ Railway ↔ Atlas hops:

1. **CORS preflight tax (biggest).** Frontend and backend are different origins and every request carries an `Authorization` header → "non-simple" request → browser fires an `OPTIONS` preflight before nearly every GET. `cors()` set no `Access-Control-Max-Age`, so the browser re-preflighted constantly (~5 s default cache) — **2× round-trips per call**.
2. **`protect` did a wasted query on every request.** `Member.findById().populate('weddingId')` fetched the entire Wedding doc (20 categories) via a second query just to read `weddingId._id`, which is already on the member — one wasted DB round-trip on *every* authenticated endpoint.
3. **Summary ran 6 queries sequentially.** `GET /expenses/summary` `await`ed 6 aggregations one-by-one → 6 sequential Atlas round-trips.

**Fixes (all backend latency, benefit every endpoint incl. both tabs):**
- `Backend/server.js` — added `maxAge: 86400` (+ `optionsSuccessStatus: 204`) to `cors()`. Browser now caches the preflight 24 h → kills the repeated `OPTIONS` round-trip.
- `Backend/middleware/auth.js` — `protect` now `Member.findById().select('name role isActive weddingId').lean()` with **no populate**. `req.weddingId = member.weddingId` directly. Removes a full Wedding fetch + round-trip from every authenticated request. (Verified safe: `req.member` is only read for `_id`/`name`/`role`, never `.save()`d; nothing relies on a populated `weddingId`.)
- `Backend/routes/expenseRoutes.js` — `GET /summary`'s 6 independent queries wrapped in `Promise.all` → dashboard pays ~1 round-trip instead of 6.

**Frontend — skeleton → premium loader:**
- New `Frontend/src/components/Loader.tsx` — reusable gradient-**ring** spinner (conic-gradient arc carved into a ring via radial CSS mask, brand rose/violet, `drop-shadow` glow, optional caption). Pure CSS, zero deps, `prefers-reduced-motion` aware, `role="status"` + `aria-label`.
- CSS added to `index.css` (`.app-loader`, `.app-loader-ring`, `.app-loader-label`) right after the skeleton block.
- `AllExpenses.tsx` + `MyExpenses.tsx` — replaced the `.skeleton` block with `<Loader label={t('common.loading')} />`. (The in-place dim-on-refetch `isFetching` overlay in AllExpenses is unchanged — the ring only shows on first load.)
- New i18n key `common.loading` (en `Loading…` / hi `लोड हो रहा है…`).
- **Centering tweak (per owner feedback):** the ring was sitting too high (pinned just below the header/chips). Bumped `.app-loader` `min-height` `220px → 60vh` so the centered flex column fills the visible area and the ring + caption sit vertically centred. One-line CSS change; applies to both tabs.

**Infra note (NOT code — owner action):** the residual first-request delay is **cold start**. Ensure Railway "app sleeping" is OFF (always-on) and consider an uptime pinger hitting `GET /api/health`; confirm the Railway region is close to the MongoDB Atlas region to minimise per-query latency (§11 risk #2).

**Verification:** `npm run typecheck` → 0 errors, `npm run lint` → 0 problems, `vite build` green (JS 118.98 KB gz, CSS 9.60 KB gz). Backend files `node -c` syntax-clean.

**Files added:** `Frontend/src/components/Loader.tsx`.
**Files changed:** `Backend/server.js`, `Backend/middleware/auth.js`, `Backend/routes/expenseRoutes.js`, `Frontend/src/pages/AllExpenses.tsx`, `Frontend/src/pages/MyExpenses.tsx`, `Frontend/src/index.css`, `Frontend/src/i18n/translations.ts`.

### Where we are right now (as of 2026-05-24)

**Current state:** The frontend is completely migrated to TypeScript with zero compilation errors and a **fully working TS-aware ESLint setup** (`npm run lint` → 0 problems; all `react-hooks@7`/`react-refresh` findings refactored away rather than suppressed). The **landing/auth page** is a split-screen premium sign-in, responsive across mobile/tablet/desktop and both themes. **Both expense views now share the same premium table UX** with zero-dependency sortable/filterable headers: AllExpenses uses debounced + abortable + query-cached **server-side** fetching (no more API spam on header clicks), and MyExpenses uses instant **client-side** sort/filter/chips over its one-shot full list. React contexts are split into context+hook vs provider files. Security, auth, CSP, and deploy configs (Vercel+Railway) are ready. Verified locally via `tsc --noEmit` (0 errors), `vite build`, CDP device-accurate screenshots, and a **headless-Chrome CDP smoke test of all core flows (7/7 passed, 0 console errors)**; **not yet confirmed live in production**.

**Immediate next action:** Finish the Railway/Vercel deploy (set `GOOGLE_CLIENT_ID`, `NODE_ENV=production`, SMTP creds, and the Vercel env + Google authorized-origins for the prod URL — note `origin_mismatch` until the prod origin is whitelisted), smoke-test all auth flows in production, then end-to-end testing with a real Indian family. After that: PWA Phase B (manifest, icons, service worker) and Phase C (offline expense queue).

---

## 10. What has NOT been built yet (deliberately)

- **Automated test suite** — P1 item. Manual testing is sufficient at prototype scale. Invest when approaching launch.
- ~~**Receipt uploads**~~ — ✅ **Built (2026-05-07, hardened 2026-05-08)**. Cloudinary chosen. Camera capture + gallery pick + auto-optimize + live upload progress + partial-success warning routing.
- ~~**Full-screen receipt viewer**~~ — ✅ **Built (2026-05-08)**. Pinch/wheel/double-tap zoom, drag-to-pan with bounds, one-tap JPG download via Cloudinary `fl_attachment` transform. Custom Pointer Events implementation, zero dependencies.
- **Mobile app** — P3 item. React Native planned. Don't build until web version is proven with real users. PWA may suffice for P1-P2.
- **Payment splitting** — P3 item. Complex settlement logic. Current "paidBy" field is a stepping stone but not a split tracker.
- **AI features** — P3 item. Receipt OCR, budget predictions, anomaly detection. This is the monetization trigger — don't build until free tier has traction.
- **Email notifications** — P2 item. Needs email service provider (SendGrid/Resend). Don't add until deployment is stable.
- ~~**Password reset flow**~~ — ✅ **Built (2026-05-23)**. Email-based: hashed token (1 h expiry), generic anti-enumeration responses, provider-agnostic SMTP via `nodemailer` (dev logs the link). `/reset-password` page. Requires SMTP creds in production to actually send.
- ~~**Input sanitization / injection**~~ — ✅ **Built (2026-05-23)**. Custom `mongoSanitize` middleware strips `$`/`.` keys (NoSQL operator injection); CSP + security headers via `vercel.json` cover XSS hardening. React auto-escaping + no `dangerouslySetInnerHTML`. (Did NOT add `xss-clean` — unmaintained; CSP + React escaping is the better path.)
- **Image/avatar uploads** — P2 item. Currently uses initial-letter avatars with deterministic color hashing (Google sign-in users get their Google avatar). Sufficient for now.
- **Offline support** — P3 item. Service workers + IndexedDB for offline expense entry. Planned as PWA Phase C (offline expense queue) per the deploy plan.

---

## 11. Top risks and unresolved questions

### Risks

1. **UX confusion for non-tech family members** — The #1 risk. If Uncle Ji can't figure out how to add an expense, the product fails. **Mitigation:** User testing with actual non-tech family members before launch. Simplify ruthlessly. Hindi localization is not optional — it's survival.

2. **Cold-start hosting** — Render free tier has 30-50s cold starts after 15min inactivity. Unusable for a real-time family app. **Mitigation:** Deploy to Railway ($5/mo) or Fly.io for always-on. Budget this as a hard cost.

3. ~~**No password reset**~~ — ✅ **Resolved 2026-05-23.** Email-based reset flow shipped (hashed 1 h token, anti-enumeration, SMTP via `nodemailer`, `/reset-password` page). Residual: SMTP creds must be set in production for emails to actually send (dev logs the link).

4. ~~**Google Sign-In credential verification**~~ — ✅ **Resolved 2026-05-23.** `google-auth-library` `verifyIdToken` now verifies signature + audience + issuer + expiry server-side in `Backend/utils/googleVerify.js`. Old insecure base64-decode removed. Fails safe (`503`) if `GOOGLE_CLIENT_ID` unset.

7. **CRITICAL join-flow takeover (fixed 2026-05-23, monitor the residual).** The fix restricts name-based re-entry to passwordless members. Residual by design: anyone with the join code can still re-enter as a *passwordless* member by name (the deliberate frictionless tradeoff, §4) — acceptable only because the admin is now password/Google-protected. If hostile actors become a concern, add per-member secrets or expiring join codes.

8. **Production auth config drift.** Google sign-in needs the prod origin in Google authorized origins (else `origin_mismatch`), `GOOGLE_CLIENT_ID` on Railway, and `VITE_GOOGLE_CLIENT_ID` in Vercel (the `.env` is gitignored). CSP `connect-src` allows `https://*.up.railway.app` — update it if the backend moves to a custom domain. **Mitigation:** the deploy checklist in §9 (2026-05-23).

5. **MongoDB Atlas free tier limits** — M0 cluster: 512MB storage, shared RAM. Sufficient for dozens of weddings, may struggle at hundreds. **Mitigation:** Monitor usage. Upgrade to M2 ($9/mo) when approaching 50% storage.

6. **No data backup strategy** — Atlas has basic backup on paid tiers only. Free tier has no point-in-time recovery. **Mitigation:** Implement weekly `mongodump` to cloud storage as a stopgap.

### Unresolved questions

- [ ] **Hosting provider decision** — Railway vs Fly.io vs Render paid tier? Need to benchmark cold-start and latency.
- [ ] **Cloud storage for receipts** — Cloudinary (generous free tier, image transforms) vs S3 (cheaper at scale)?
- [x] ~~**i18n library choice** — `react-i18next` vs `react-intl` vs custom context-based solution?~~ **Resolved 2026-05-07: chose custom context-based solution.** ~5 KB gzipped vs 30+ KB for `react-i18next`. No dynamic loading needed (only 2 languages). `useLang()` provides `t()`, `tCat()`, `tServer()`, `toggleLang()`.
- [ ] **PWA vs native app priority** — PWA gets us 80% of mobile app benefits at 10% effort. But notifications need native. Decision at P2 gate.
- [ ] **Expense approval workflow** — Should admins approve expenses before they count, or is trust-based tracking sufficient?

---

## 12. How a fresh AI chat should use this file

1. **Read this entire file before making any suggestions.** The architectural decisions, deliberate deferrals, and phase gates are all intentional.

2. **Respect the phase gates.** We are in **P0 Prototype**. Do not propose P2/P3 features (Hindi localization, mobile app, AI) unless explicitly asked. Focus on hardening what exists and preparing for P1 Launch.

3. **UX simplicity is the supreme constraint.** Every UI change must pass the "can a non-tech family elder use this?" test. When in doubt, simplify. Remove steps. Use bigger buttons. Use emoji as visual anchors.

4. **Don't break the re-entry flow.** The soft-delete + reactivation pattern for members is deliberate and load-bearing. Members who are removed must be able to rejoin (via join code) or log back in (via email) without losing their expense history.

5. **Wedding-scoped isolation is a hard rule.** Every database query must filter by `weddingId`. Every route must go through `protect` middleware. Cross-wedding data leakage is a project-ending bug.

6. **Mobile-first is not optional.** Max container width is 500px. Bottom navigation. No hover-only interactions. Touch targets ≥ 44px. Test on a phone-sized viewport.

7. **Update this file after meaningful work.** Append to §9 (Progress Log), tick boxes in §8 (Roadmap), bump the "Last updated" date. Move items from §10 to §9 when they're built.

8. **Don't "helpfully" build deferred features.** §10 explains what's deliberately not built and why. Don't add Redis, don't add microservices, don't add a test suite, don't add i18n — unless the user explicitly asks.

9. **The design system is in `index.css`.** All styling uses CSS custom properties. Dark and light themes are defined. Use existing class names (`glass-card`, `expense-item`, `stat-card`, `category-chip`, etc.) — don't invent new component styles.

10. **When in doubt, ask.** Don't assume. This is a family's wedding money — data integrity matters more than velocity.

---

## Quick Facts

| Key | Value |
|---|---|
| **Project** | Wedding Expense Tracker — collaborative family wedding expense management |
| **Stage** | P0 Prototype (pre-launch) — i18n + premium design system landed early |
| **Tech** | React 19 (TypeScript) + Vite 8 → Express 4 + Mongoose 8 → MongoDB Atlas |
| **Architecture** | Two-tier monolith: SPA frontend + REST API backend |
| **Auth** | JWT (30d) + bcrypt (rounds 12) + **server-verified Google Sign-In** (`google-auth-library`). Members join via 6-char code (no password); credentialed accounts must use Login (join-takeover fix). Email-based password reset. |
| **DB** | 3 collections: Wedding, Member, Expense. Wedding-scoped isolation |
| **i18n** | English + conversational North-Indian Hindi. Custom context (~5 KB gzipped). Toggle on Landing/Dashboard/Settings |
| **Design** | Premium SaaS v2: warm-cream light + dark themes, Inter + Noto Sans Devanagari, rose/violet gradient palette, glassmorphic + layered shadows, responsive mobile/tablet/desktop with floating-pill bottom nav on desktop |
| **Bundle** | ~118.9 KB gzipped JS, ~9.4 KB gzipped CSS (post TS migration + dual table views). Zero motion-lib deps — pure CSS animations + Pointer Events. |
| **Receipts** | Cloudinary upload with auto-optimize. Live upload-progress UX. Backend returns `warning` field on partial-success (silent failures eliminated). Full-screen viewer with pinch/wheel/dbl-tap zoom, drag-pan, one-tap JPG download via `fl_attachment` URL transform. |
| **Categories** | 20 culturally-aware Indian wedding defaults. Smart migration CTA in Settings for weddings created before expansion. |
| **Data freshness** | Three-layer pattern: refresh on auth, on tab visibility (15s throttle), on AddExpense mount. Members always see admin's latest category list. |
| **Hard rule** | Every query must filter by `weddingId`. No cross-wedding leakage. User-typed data is never translated — only UI chrome. |
| **Owner** | Alok Kumar — `contact.alokkumarr@gmail.com` |
| **Next milestone** | Finish Vercel + Railway deploy (env vars, Google authorized origins, SMTP), smoke-test auth in prod, then P0 gate: one real wedding uses it end-to-end without confusion. Then PWA Phase B (manifest/icons/SW) + Phase C (offline expense queue). |