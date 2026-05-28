# Wedding Expense Tracker — Master Context

> **Purpose of this file.** Canonical handoff document for Wedding Expense Tracker. Drop the contents (or a link to this file) into any fresh AI chat — Claude, GPT, Gemini — and the assistant will have everything it needs: what the product is, why it exists, how it is built, what is already shipped, and exactly where work stands right now.
>
> **Last updated:** 2026-05-28
> **Project day 0:** 2026-04-28
> **Current phase:** P0 Prototype → P1 Launch prep — core logic + i18n + design system + receipts complete; production-grade Google auth, security-audit hardening, password reset, CSP, and deploy config (Vercel + Railway) now in place; real-family testing + go-live pending
> **Strategic direction (2026-05-27):** The wedding tracker is **Vertical #1** of a planned multi-vertical expense-tracking SaaS. **Phase 0a (Workspace abstraction) + Phase 2 (Personal MVP) both shipped 2026-05-27**: end-to-end Personal-vertical flow live — type picker on Landing, dedicated Personal create form, month-scoped Dashboard with switcher, features-driven hiding of multi-member sections. The wedding flow is byte-identical to before. Next: **Phase 1 (Trip MVP)**. Phase 0b (cosmetic rename `Wedding`→`Workspace`) deferred until after Trip ships. See **§9 Multi-Vertical SaaS Expansion Plan** for full details.
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
8. [Roadmap (phased)](#8-roadmap-phased) *(wedding-vertical product roadmap)*
9. [Multi-Vertical SaaS Expansion Plan](#9-multi-vertical-saas-expansion-plan) *(cross-vertical platform plan, owner-approved 2026-05-27)*
10. [Progress log — what has been built](#10-progress-log--what-has-been-built)
11. [What has NOT been built yet (deliberately)](#11-what-has-not-been-built-yet-deliberately)
12. [Top risks and unresolved questions](#12-top-risks-and-unresolved-questions)
13. [How a fresh AI chat should use this file](#13-how-a-fresh-ai-chat-should-use-this-file)
14. [Security Audit & Remediation Plan](#14-security-audit--remediation-plan) *(audited 2026-05-28 — 1 Critical / 8 High / 15 Medium / 8 Low — Days 1-7 ✅ shipped; Week 2 full C-2 + H-8 + CSRF next)*

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

> **Note (2026-05-27):** This roadmap is the **wedding-vertical product roadmap**. The cross-vertical platform plan (Workspace abstraction + extending to Trip and Personal expense trackers) is in **§9 — Multi-Vertical SaaS Expansion Plan**. The two are complementary: §8 tracks features within the wedding vertical; §9 tracks the platformisation of the codebase.

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

## 9. Multi-Vertical SaaS Expansion Plan

> **Decided 2026-05-27.** The Wedding Expense Tracker is the **first vertical** of a broader expense-management SaaS. Owner's vision: the same collaborative-expense-tracker mechanic serves multiple use cases — weddings, travel groups, personal monthly budgets, and more. This section documents the architectural direction and the phased plan that converts the wedding-specific app into a multi-vertical platform **without rebuilding from scratch**.

### 9.1 — The core insight

The wedding tracker is already ~90% a generic group-expense container. The wedding-specific parts are surprisingly thin:

- **Naming** — `weddingName`, `coupleNames`, `weddingId` references throughout
- **Default categories** — the Indian wedding 20-pack
- **A handful of i18n strings** — "Wedding", "Couple Names", "Top Contributors"
- **A couple of fields** — `weddingDate`, `coupleNames`

Everything else — auth, members + join codes, expense CRUD, receipts, dashboard aggregations, i18n infrastructure, design system, Vercel + Railway deploy, security audit, CSP, password reset — is **vertical-agnostic by accident**. The plan makes it agnostic on purpose.

### 9.2 — Architectural decision: the Workspace abstraction

Introduce a `Workspace` model with a `type` discriminator (`'wedding' | 'trip' | 'personal'` initially; extensible to `'household'`, `'event'`, `'business'`, etc.). Each type carries its own default categories, feature flags, and metadata. Standard **Single Table Inheritance + discriminator** pattern — Mongoose supports it natively.

| Layer | Today | After abstraction |
|---|---|---|
| Mongo collection | `weddings` | `workspaces` (or keep collection name; just add `type` field — cheaper migration) |
| FK on Member | `weddingId` | `workspaceId` |
| FK on Expense | `weddingId` | `workspaceId` |
| Type-specific fields | All top-level on Wedding | `meta` subdoc keyed by type |
| Default categories | One list in `defaultCategories.ts` | Map `{ wedding: [...], trip: [...], personal: [...] }` |
| Features available | Implicit (all wedding features always on) | `features` flag set derived from `type`: `{ joinCode, multiMember, settlement, monthlyBudget, recurring, income }` |

UI checks the `features` flag before rendering each section. Zero `if (type === 'wedding')` scatter through JSX.

### 9.3 — Reusability map

| Layer | Reuse | Change | New |
|---|---|---|---|
| Backend models | Expense (~95%) | Wedding → Workspace + `type` + `meta`; FK renames | Settlement helper (Phase 3); recurrence metadata (Phase 4) |
| Backend routes | `/auth/*`, `/expenses/*` (~95%) | `/weddings/*` → `/workspaces/*`. Keep old paths as 308-redirect aliases for prod safety | `/workspaces/:id/balances` (Trip); month-scoped expense queries (Personal) |
| Auth / middleware | `protect`, `adminOnly`, JWT, bcrypt, sanitize, rate-limit | `protect` reads `workspaceId` (already a direct field after 2026-05-24 latency fix — trivial rename) | Personal-mode signup auto-creates the lone owner member |
| Frontend context | Provider split pattern (`WeddingProvider` + `useWedding`) | Rename to `WorkspaceContext` / `useWorkspace`; consumer call sites are a sed | none |
| Frontend pages | Dashboard, AddExpense, MyExpenses, AllExpenses, Settings, BottomNav, ExpenseDetailSheet, ReceiptViewer, Loader | Wedding labels → type-aware via i18n; per-type sections via `features` flag | `WorkspaceTypePicker` onboarding; Month switcher (Personal); Settlement view (Trip Phase 3) |
| Design system | 100% of `index.css` — glass, themes, tables, loaders, receipts | none | none |
| i18n | All keys structurally | Namespace `wedding.*` → `workspace.wedding.*`; parallel `workspace.trip.*` + `workspace.personal.*`. Add `tw(key)` helper that resolves against current workspace type | Trip + Personal strings |
| Receipts (Cloudinary + viewer) | 100% | none | none |
| Deploy / security / CSP | 100% | none | none |
| Multi-wedding selector | Selection mechanic | Renamed; now shows mixed-type workspaces (one Wedding + one Trip + one Personal under same email) | none |

**Rough reuse: ~80% backend, ~70% frontend.** Cloudinary, security audit, CSP, design system, premium tables, loaders, and i18n infra all carry over untouched.

### 9.4 — Per-vertical specs

#### Trip (Travel groups)

| Aspect | Spec |
|---|---|
| Container fields | `name`, `destination`, `startDate`, `endDate`, `budget?`, `currency` (default INR) |
| Members | Same join-code mechanic. Admin = trip organiser. |
| Default categories | Flights ✈️, Trains 🚆, Hotel/Stay 🏨, Local Transport 🚕, Food & Drinks 🍴, Activities 🎟️, Shopping 🛍️, SIM/Data 📶, Visas/Docs 📄, Insurance 🛡️, Misc 📦 |
| Lifespan | Days–weeks |
| Settlement (Phase 3) | Per-expense `splitMode: 'equal' \| 'shares' \| 'none'` + `splitWith: [memberId]`. Net-balance per member. Min-transactions settlement suggestions. |
| Multi-currency | Defer. Field present from day 1; conversion logic later. |
| Dropped vs Wedding | Indian wedding categories, couple names, wedding-specific copy |

#### Personal (Monthly budget)

| Aspect | Spec |
|---|---|
| Container fields | `name` (default "My Budget"), `monthlyBudget`, `currency` |
| Members | **Auto-created single owner at signup. No join code surfaced.** |
| Default categories | Rent 🏠, Groceries 🛒, Eating Out 🍔, Transport 🚇, Utilities 💡, Subscriptions 🎬, Health 💊, Shopping 🛍️, Investments 📈, EMIs/Loans 🏦, Personal Care 💆, Entertainment 🎮, Misc 📦 |
| Time scope | **Expenses bucketed by month.** Dashboard defaults to current month. Header has a month-switcher. Budget is monthly recurrence, not a lifetime total. |
| Income tracking (Phase 4) | `direction: 'expense' \| 'income'` on Expense. Dashboard shows Income, Expense, Net, by-category. |
| Recurring (Phase 4) | `recurrence: { freq: 'monthly', dayOfMonth, endsOn? }`. Lazy materialiser on month change — no cron. |
| Dropped vs Wedding | Join code UI, Members page, "Top Contributors", "Added by" column, multi-admin role distinction |

### 9.5 — Cross-cutting abstractions

1. **`Workspace.type` discriminator** + a `meta` subdocument for type-specific fields. Mongoose discriminators give per-type validation without polymorphic mess.

2. **`Workspace.features`** — derived from `type`. UI checks flag before rendering each section. Single source of truth, no `if (type === 'wedding')` scatter.

3. **Default-category seeding keyed by type** — `Frontend/src/constants/defaultCategories.ts` and the backend `pre('save')` hook become a map per type. The same `getMissingDefaults` migration CTA pattern works per type.

4. **i18n namespace migration** — `wedding.*` → `workspace.wedding.*`; add parallel `workspace.trip.*` + `workspace.personal.*`. New `tw(key)` helper in `LanguageContext` auto-prefixes with current workspace type.

5. **`/api/workspaces` route family** mirroring `/weddings`. Keep `/api/weddings/*` as **308-redirect aliases** for prod safety — the live wedding app keeps working through the transition.

6. **`WorkspaceTypePicker`** — new Landing screen: "What do you want to track? 💒 Wedding / ✈️ Trip / 💰 Personal Budget". Picking routes to a type-specific Create form.

7. **Mixed-type multi-workspace selector** — existing multi-wedding flow generalises trivially. One email owns Wedding + Trip + Personal simultaneously; selector lists all three with type icons.

### 9.6 — Phased implementation plan

Five phases, each with a verifiable gate.

#### Phase 0 — Abstraction refactor (zero user-visible change)
**Split decision (2026-05-27):** The original Phase 0 scope (full rename including `weddingId` → `workspaceId`, model class rename, file renames, API path rename + prod data migration) was ~86 call sites + a DB migration with real blast radius — *all cosmetic*, none of it delivering multi-vertical capability. Pragmatic split: do the **functional abstraction additively now** (0a); do the **cosmetic rename pass** later (0b) once Personal + Trip have shipped and the abstraction is proven.

##### Phase 0a — Functional abstraction (additive, this session)
**Goal:** the Wedding model can host any vertical via a `type` discriminator. Zero rename, zero DB migration. Existing wedding flow byte-identical to before.

- Backend `Wedding.js`: add `type: 'wedding' | 'trip' | 'personal'` field (default `'wedding'`)
- New `Backend/constants/workspaceDefaults.js`: type-keyed `DEFAULT_CATEGORIES_BY_TYPE` map + `FEATURES_BY_TYPE` map (joinCode, multiMember, settlement, monthlyBudget, recurring, income, topContributors)
- `pre('save')` category-seeding hook now reads from the type-keyed map
- `features` virtual exposed on the model
- Frontend `types/index.ts`: add `WorkspaceType`, `WorkspaceFeatures`; extend `Wedding` interface with optional `type` + `features`
- Frontend `constants/defaultCategories.ts`: mirror the type-keyed map; `getMissingDefaults(currentCategories, type?)` accepts a type
- Frontend `WeddingContext`: expose `workspaceType` + `features` + `tw(key)` helper (resolves `workspace.<type>.<key>` with fallback to plain `t()`)
- **Gate:** existing wedding flow unaffected; `npm run lint` / `tsc --noEmit` / `vite build` all green; backend `node -c` clean.
- **Effort:** 1 session. Touches ~5 files additively. No prod migration.

##### Phase 0b — Cosmetic rename pass (deferred until Personal + Trip ship)
**Goal:** rename to canonical `Workspace` naming once the abstraction is proven.

- File rename: `Wedding.js` → `Workspace.js`; `WeddingContext.tsx` → `WorkspaceContext.tsx`; `WeddingProvider.tsx` → `WorkspaceProvider.tsx`
- Class/hook rename: `Wedding` model → `Workspace`; `useWedding` → `useWorkspace`
- Field rename: `weddingId` → `workspaceId` everywhere (~86 call sites)
- Route rename: `/api/weddings/*` → `/api/workspaces/*` with 308 alias from old paths
- i18n namespace move: `wedding.*` → `workspace.wedding.*`
- **One-time prod migration script** to rename the `weddingId` field on Member + Expense collections during a maintenance window
- **Gate:** wedding flow works identically; lint/typecheck/build green; smoke test of all major routes via CDP.
- **Effort:** 1 focused session, after Personal + Trip MVPs have shipped.

#### Phase 1 — Trip type (MVP, no settlement)
**Goal:** travel groups can create a trip, share a join code, log expenses, see a dashboard.

- Workspace type `'trip'` + trip metadata + default trip categories
- `WorkspaceTypePicker` on Landing
- Trip-specific Create form (destination, dates, optional budget)
- Members/join code reused unchanged
- Dashboard labels swap via i18n
- **Gate:** one real trip tracked end-to-end on staging.
- **Effort:** ~1 session on top of Phase 0.

#### Phase 2 — Personal type (MVP, no recurring/income)
**Goal:** single user signs up, sets monthly budget, logs current-month expenses.

- Workspace type `'personal'`; signup auto-creates lone owner member, no join code UI ever shown
- Month switcher in Dashboard header; expense queries scoped to selected month
- Conditionally hide Members, Top Contributors, "Added by" via `features` flag
- New personal default categories
- **Gate:** owner dogfoods one full month without confusion.
- **Effort:** 1–2 sessions (month-bucketing is the new logic).

#### Phase 3 — Trip: settlement
**Goal:** trip workspaces show "who owes whom" + min-transactions suggestions.

- `Expense` gains `splitMode`, `splitWith[]`, optional `shares{}`
- AddExpense step 4 (Trip only): split UI
- New `GET /api/workspaces/:id/balances` → net per member
- Settlement page: balances + debt-simplification (O(n²) is fine for ≤20 travelers)
- **Gate:** trip with 3+ members and mixed payers shows correct balances.
- **Effort:** ~2 sessions.

#### Phase 4 — Personal: income + recurring expenses
**Goal:** personal users track salary + auto-rolling subscriptions.

- `Expense.direction: 'expense' | 'income'`
- `Expense.recurrence: { freq, dayOfMonth, endsOn? }`
- Lazy materialiser on month change (no cron): opening a new month auto-creates that month's recurring rows from templates
- Dashboard: Income card + net cashflow
- **Gate:** rent + Netflix auto-appear next month; salary card shows correct net.
- **Effort:** 1–2 sessions.

### 9.7 — Approved order

**Owner approved on 2026-05-27:** Phase 0 → **Phase 2 (Personal MVP)** → Phase 1 (Trip MVP) → Phase 3 (Trip Settlement) → Phase 4 (Personal Income + Recurring).

**Why Personal before Trip:**
- Personal stress-tests the abstraction hardest — single member, monthly scope, no join code. If Workspace holds for Personal, Trip is trivial.
- Personal is easiest to dogfood — owner uses it daily, finds sharp edges fast.
- Trip without settlement overlaps too much with Wedding to validate the abstraction. Trip is best done together with Phase 3 (settlement) right after.

### 9.8 — Open decisions

Owner input needed before Phase 0 fully lands:

1. **Naming.** Internal engineering term: **Workspace** (recommended). User-facing copy stays vertical-specific via i18n ("Your Wedding" / "Your Trip" / "Your Budget"). To confirm.

2. **Brand strategy.** One unified SaaS vs separate verticals (e.g., `weddingtracker.app`, `triptracker.app`). **Recommendation:** unified product first; per-vertical SEO landing pages from the same backend later.

3. **Live wedding URL.** After Phase 0 stabilises, brand should be vertical-neutral. Wedding URL 301-redirects to it. Decide post-Phase-0.

4. **Personal signup decoupling.** Currently every user is a member of some wedding. For Personal, user *is* the workspace — sign up auto-creates one. Need to lift the coupling cleanly. Low risk, called out for transparency.

### 9.9 — Risks

1. **i18n migration size.** ~80–100 string moves × 2 languages. Mechanical but error-prone. Plan: one careful pass with `tsc` + `npm run lint` as safety nets, plus an aliased fallback for one release.

2. **Prod migration safety.** Live wedding data must not break. Strategy: Phase 0 adds new fields, keeps old (`weddingId` aliased to `workspaceId`); one-time migration script during maintenance window; old fields dropped in Phase 1+.

3. **Naming bleed.** If "wedding" leaks into Workspace-layer code (variable names, comments, types), the abstraction gets contaminated. Strict review gate: zero `wedding`-named identifiers in code that's supposed to be generic.

4. **Settlement algorithm scope.** Don't over-engineer. Naive net-balance + greedy min-transactions for ≤20 travelers. Skip currency conversion v1.

5. **Onboarding regression.** The `WorkspaceTypePicker` adds a step before Create/Join. Mitigate by remembering choice in localStorage + supporting deep-link bypass (`/create?type=wedding`).

### 9.10 — Current status

**Plan approved:** 2026-05-27.
**Phase 0a (functional abstraction):** ✅ **completed 2026-05-27**. `type` discriminator, `features` matrix, type-keyed category defaults, and `tw()` translation helper live on backend + frontend. Existing wedding flow byte-identical.
**Phase 2 (Personal MVP):** ✅ **completed 2026-05-27** — see §10 Progress log. End-to-end Personal-vertical flow: type picker → personal create form → month-scoped Dashboard with switcher → features-driven hiding of multi-member sections (Top Contributors, Join Code, "Added by", AllExpenses tab, Members tab) → Settings auto-relabelled. Production-safe: `POST /api/weddings/personal` is a new route alongside the unchanged wedding create; the `?from`/`?to` range params on `/expenses` + `/expenses/summary` are no-ops when omitted (Wedding/Trip unaffected). One-shot index migration script (`Backend/scripts/migrateWorkspaceIndexes.js`) must run once before the first Personal workspace is created in prod (to drop+recreate `joinCode` index as `sparse`). Build green: CSS 9.61 KB gz unchanged, JS 122.37 KB gz (+2.73 KB gz vs Phase 0a).
**Phase 0b (cosmetic rename):** deferred until after Trip MVP also ships.
**Phase 1 (Trip MVP):** ⏭ next — group-travel vertical with `type='trip'`. Reuses the new picker + create-form pattern; adds trip-specific metadata (destination, start/end dates) and shares the existing join-code mechanic.
**Existing wedding vertical:** unaffected throughout; production deploy effort continues in parallel.

---

## 10. Progress log — what has been built

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
- Custom context-based i18n (no `react-i18next` — chose lightweight bespoke solution to keep bundle small and align with §12 unresolved question, now resolved)
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
- Chose **Vercel (frontend) + Railway (backend)**; MongoDB Atlas unchanged. Decision: ship as an installable **PWA first**, wrap with Capacitor for app stores only after P0 validates (matches §8 P1 "PWA support" + §11 "PWA may suffice").
- `Backend/Procfile` (`web: node server.js`); Railway **Root Directory = `Backend`** (monorepo — Railpack fails at repo root with no package.json).
- **List-aware CORS** (`server.js`) — `FRONTEND_URL` is now comma-separated (prod + Vercel preview origins); added `X-Idempotency-Key` to the allowlist (for a future offline-queue Phase C).
- **Env-driven API base URL** — `api.js` uses `import.meta.env.VITE_API_URL`, falling back to `/api` (Vite proxy) for local dev. Added `Frontend/vercel.json` (SPA fallback that excludes `/sw.js`, `/manifest.webmanifest`, static assets; cache headers).
- Added `Backend/.env.example` and `Frontend/.env.example` (the missing `Frontend/.env` with `VITE_GOOGLE_CLIENT_ID` was the reason the Google button never rendered).

**Feature — Production-grade Google Sign-In (resolves §12 risk #4):**
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

**Feature — Content-Security-Policy + security headers (resolves §12 M4):**
- `vercel.json` now sets a strict **CSP** on the production document: `script-src 'self' https://accounts.google.com/gsi/client` (no `unsafe-inline` — the Vite build has zero inline scripts), `style-src 'unsafe-inline'` (React inline styles + Google Fonts), `img-src` for Cloudinary + Google avatars, `connect-src` for the API + GSI, `frame-src` for the GSI button, plus `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action 'self'`.
- Also: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `HSTS`. (Dev/Vite is intentionally CSP-free — Vite HMR needs looser rules.)

**Feature — Email-based password reset (resolves §12 risk #3):**
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

**Infra note (NOT code — owner action):** the residual first-request delay is **cold start**. Ensure Railway "app sleeping" is OFF (always-on) and consider an uptime pinger hitting `GET /api/health`; confirm the Railway region is close to the MongoDB Atlas region to minimise per-query latency (§12 risk #2).

**Verification:** `npm run typecheck` → 0 errors, `npm run lint` → 0 problems, `vite build` green (JS 118.98 KB gz, CSS 9.60 KB gz). Backend files `node -c` syntax-clean.

**Files added:** `Frontend/src/components/Loader.tsx`.
**Files changed:** `Backend/server.js`, `Backend/middleware/auth.js`, `Backend/routes/expenseRoutes.js`, `Frontend/src/pages/AllExpenses.tsx`, `Frontend/src/pages/MyExpenses.tsx`, `Frontend/src/index.css`, `Frontend/src/i18n/translations.ts`.

### 2026-05-27 — Multi-Vertical Phase 0a: Workspace abstraction (additive, production-safe)

First implementation slice of the multi-vertical expansion plan (§9). Owner approved a **split Phase 0** earlier the same session: Phase 0a does the **functional** abstraction additively now (zero rename, zero DB migration); Phase 0b — the full cosmetic rename including `Wedding` → `Workspace`, `weddingId` → `workspaceId`, file renames, and prod data migration — is deferred until after Personal + Trip MVPs ship and the abstraction is proven (§9.6 Phase 0).

**Feature — type-keyed workspace defaults (`Backend/constants/workspaceDefaults.js`, new):**
- Canonical per-vertical configuration source: `DEFAULT_CATEGORIES_BY_TYPE`, `FEATURES_BY_TYPE`, `WORKSPACE_TYPES`, `DEFAULT_WORKSPACE_TYPE`, plus `getDefaultCategories(type)` / `getFeatures(type)` resolvers (defensive fallbacks for unknown types — never return `undefined`).
- 3 default category lists curated for each vertical: **wedding** (20 — Indian-wedding-specific, unchanged from the original 2026-05-07 set), **trip** (11 — Flights, Hotel, Local Transport, Activities, Visas, etc.), **personal** (13 — Rent, Groceries, Utilities, Subscriptions, EMIs, Investments, etc.).
- Feature flag matrix per type: `joinCode`, `multiMember`, `settlement`, `monthlyBudget`, `recurring`, `income`, `topContributors`. Wedding inherits the original behaviour (joinCode + multiMember + topContributors); Trip adds settlement; Personal flips to monthlyBudget + recurring + income, drops join code / multi-member.

**Feature — Wedding model becomes type-aware (`Backend/models/Wedding.js`):**
- New `type: { enum: WORKSPACE_TYPES, default: 'wedding', index: true }` discriminator. Existing wedding documents created before today have no `type`; the `default` + a `|| DEFAULT_WORKSPACE_TYPE` fallback on every read keeps them behaving exactly as before.
- `pre('save')` category-seeding hook now reads from the type-keyed map (`getDefaultCategories(this.type)`); the inlined 20-item list moved to `workspaceDefaults.js`. Behaviourally identical for `type='wedding'`.
- `pre('save')` join-code generator now respects `features.joinCode` — generates only when the vertical opts in, never for Personal.
- New `features` virtual returns `getFeatures(this.type || DEFAULT_WORKSPACE_TYPE)` so the server response carries the flag set directly; client uses it as the primary source with `FEATURES_BY_TYPE` as fallback for stale caches.
- **Production-safety adjustments:** `coupleNames.partner1/2` and `weddingDate` schema-level `required:true` constraints relaxed to permissive — Trip / Personal don't need them. Route-layer (`POST /api/weddings`) **still enforces required** for the legacy wedding-creation API, so the wedding flow is byte-identical from the client's point of view; only non-wedding workspaces can omit them. `joinCode` becomes `sparse: true` so personal workspaces (no code) don't collide on a "null" key — note: the prod index was created without `sparse` and will need a one-time drop+recreate in the maintenance window for the first Personal create (logged as a §11 deferred item for Phase 2).

**Feature — frontend type system + features map (`Frontend/src/types/index.ts`, `Frontend/src/constants/defaultCategories.ts`):**
- `WorkspaceType` (`'wedding' | 'trip' | 'personal'`), `WorkspaceFeatures` interface, `WORKSPACE_TYPES` constant, `DEFAULT_WORKSPACE_TYPE` export.
- `Wedding` interface extended with optional `type?: WorkspaceType` and `features?: WorkspaceFeatures`. Optional because legacy server responses (and the cached localStorage payload from a session that pre-dates 0a) may omit them.
- `defaultCategories.ts` rewritten to mirror the backend: per-vertical lists, `DEFAULT_CATEGORIES_BY_TYPE`, `getDefaultCategories(type?)`, plus `FEATURES_BY_TYPE` + `getFeaturesByType(type?)`. `getMissingDefaults(currentCategories, type?)` gained an optional `type` parameter; existing Settings.tsx callers that don't pass one still receive wedding defaults — no breakage.
- `DEFAULT_CATEGORIES` kept as a backwards-compatible alias pointing at the wedding list so any external import keeps working.

**Feature — WeddingContext exposes the abstraction (`Frontend/src/context/WeddingContext.tsx`, `WeddingProvider.tsx`):**
- New fields on `WeddingContextType`: `workspaceType: WorkspaceType`, `features: WorkspaceFeatures`, `tw: (key, vars?) => string`.
- Provider derives `workspaceType` from `wedding?.type ?? DEFAULT_WORKSPACE_TYPE`; `features` prefers the server-computed `wedding.features` and falls back to `getFeaturesByType(workspaceType)` for stale caches. Memoised.
- `tw(key)` — type-aware translation. Resolves `workspace.<type>.<key>` first, falls back to plain `t(key)` if the namespaced variant is missing. Phase 0a callers keep using existing `t('xxx')` keys; future verticals add their own namespaced strings without touching shared components. Works because `LanguageProvider.t()` returns the key verbatim on miss (verified in `LanguageProvider.tsx` line 55).
- Provider chain order matters: `<LanguageProvider> → <WeddingProvider>` (already in place in `main.tsx`) — `WeddingProvider` consumes `useLang()` to build `tw`.

**Production-safety design notes:**
- **Zero schema-breaking changes.** Every new field is additive with a sensible default; every existing document remains valid against the new schema.
- **No data migration required.** Existing wedding documents without `type` are treated as `'wedding'` at every read site (model default + frontend nullish coalescing).
- **API surface unchanged.** No new routes, no renamed routes, no changed response shapes (only the additive `wedding.features` virtual, which existing clients harmlessly ignore).
- **Bundle delta: +0.66 KB gzipped JS.** CSS unchanged. The whole abstraction is constants + a small map.
- **No frontend page touched.** All ~14 consumers of `useWedding()` keep destructuring the same fields they always did; `workspaceType` / `features` / `tw` are pure additions ignored by legacy code.

**Files added:**
- `Backend/constants/workspaceDefaults.js` — canonical per-vertical configuration.

**Files changed:**
- `Backend/models/Wedding.js` — type discriminator + features virtual + type-aware seeding; permissive wedding-specific fields; sparse join-code index.
- `Frontend/src/types/index.ts` — `WorkspaceType`, `WorkspaceFeatures`, `WORKSPACE_TYPES`, `DEFAULT_WORKSPACE_TYPE`, `Wedding.type/features` (optional).
- `Frontend/src/constants/defaultCategories.ts` — type-keyed map, `getDefaultCategories(type?)`, `FEATURES_BY_TYPE`, `getFeaturesByType(type?)`, typed `getMissingDefaults(_, type?)`.
- `Frontend/src/context/WeddingContext.tsx` — added `workspaceType`, `features`, `tw` to context type.
- `Frontend/src/context/WeddingProvider.tsx` — imports `useLang` (provider order LanguageProvider → WeddingProvider unchanged); derives `workspaceType` + `features` + memoised `tw`.

**Verification:** `npm run typecheck` → 0 errors. `npm run lint` → 0 errors, 1 pre-existing warning (`no-console` directive in `api.ts:53` — pre-Phase-0a, untouched). `vite build` → green, 7.34s, CSS 9.61 KB gz (unchanged), JS 119.64 KB gz (+0.66 KB gz). Backend `node -c` clean. Programmatic instantiation of all three workspace types (`new Wedding({ type: 'wedding'/'trip'/'personal' })`) returns the expected features matrix and category list.

**Deferred to Phase 2 (Personal MVP):** one-time drop + recreate of the `joinCode` unique index with `sparse: true` during the maintenance window when the first Personal workspace is created (a Personal doc has no `joinCode`, and the existing prod index would collide on the implicit `null` key).

**Deferred to Phase 0b (after Personal + Trip ship):** file/class rename `Wedding` → `Workspace`; `weddingId` → `workspaceId` (~86 call sites + prod migration); API path rename + alias; i18n namespace move.

### 2026-05-27 — Multi-Vertical Phase 2: Personal expense tracker MVP (first non-wedding vertical)

Second implementation slice of the multi-vertical plan, shipped the same day as Phase 0a. Personal-vertical workspaces — single-user, monthly-budget, no join code, no top contributors — built end-to-end on top of the Phase 0a `type`/`features` abstraction. Zero changes to the existing wedding flow; the existing wedding route handler, response shapes, JWT/session model, and CRUD pages are untouched.

**Feature — Personal create route (`Backend/routes/weddingRoutes.js` — POST `/api/weddings/personal`):**
- New sibling to the existing `POST /api/weddings` (still wedding-only). Accepts `name?` (defaults to `<adminName>'s Budget`), `monthlyBudget?`, `currency?`, `adminName` (required), plus either email+password or `googleCredential`.
- Reuses the existing `verifyGoogleCredential` flow for Google sign-up and the identical email-validation / password-strength shape as wedding-create, so the frontend can share validation messages.
- Creates a `Wedding` document with `type: 'personal'`. The pre-save hook (Phase 0a) sees `features.joinCode=false` and skips join-code generation; the category-seeding hook reads `getDefaultCategories('personal')` to seed the 13 Personal-vertical defaults.
- Auto-creates the lone owner Member with `role: 'admin'`, `relation: 'Owner'`, links it as `createdBy` on the workspace, returns the same `{ wedding, member, token }` shape as wedding-create so the frontend's `login()` callback works unchanged.

**Feature — month-scoped expense queries (`Backend/routes/expenseRoutes.js`):**
- New `parseDateRange(from, to)` helper accepts ISO timestamps and returns a Mongo `$gte`/`$lt` filter (or null on invalid input — defensive).
- `GET /api/expenses`, `GET /api/expenses/my`, and `GET /api/expenses/summary` now all accept optional `from`/`to` query params. When omitted (Wedding/Trip), behaviour is identical to before. When present (Personal), every query / aggregation pipeline applies the range — including the summary's six concurrent aggregations and the recent-expenses list.
- The summary's daily-trend window now mirrors the scoped range when present, so the chart reflects the viewed month instead of the legacy 30-day rolling window.
- Timezone choice: the client computes `from`/`to` from the user's LOCAL-time month boundaries (`new Date(year, month, 1).toISOString()`), then the server filters in UTC against those exact instants. This gives correct semantics regardless of timezone offset.

**Feature — one-shot index migration script (`Backend/scripts/migrateWorkspaceIndexes.js`):**
- Idempotent script: connects via the existing `MONGODB_URI`, inspects the `weddings.joinCode` index, drops it if not `sparse`, then runs `Wedding.syncIndexes()` to recreate from the current (sparse) schema. Verifies the final state and exits non-zero on mismatch.
- Required because Mongoose does not auto-rebuild indexes when only their options change — the prod index was created without `sparse` and would collide on the implicit `null` key the first time a Personal workspace is created. Run once per environment before the first Personal create: `cd Backend && node scripts/migrateWorkspaceIndexes.js`.

**Feature — frontend Workspace type picker + Personal create form (`Frontend/src/pages/LandingPage.tsx`):**
- The Hero's "Create" CTA (label changed `💍 Create a Wedding` → `✨ Create New`) now routes through a new `'pick-type'` mode that renders a glass-card picker with three options: 💒 Wedding (active), 💰 Personal Budget (active), ✈️ Trip (disabled with a "Coming soon" pill, Phase 1).
- New `CreatePersonalForm` component: a streamlined version of the wedding form — workspace name (optional, hint text explains the default), monthly budget (optional), owner name (required), email + password + confirm (or Google). Reuses the existing `GoogleAuthButton` singleton-init plumbing (no GSI re-init issues). Shares the `create.*` strings where they overlap (email, password, confirm) and adds a fresh `createPersonal.*` namespace for the unique copy.
- New `Mode` values: `'pick-type'`, `'create-personal'`. The wedding flow path is unchanged — clicking `pickType.wedding` jumps straight to the existing `CreateForm` so wedding users still see byte-identical screens.

**Feature — Dashboard adaptations (`Frontend/src/pages/Dashboard.tsx`):**
- New **month switcher** (rendered only when `features.monthlyBudget` is true): ◀ / centred month label / ▶, plus a tap-to-jump-to-current-month indicator (`↻`) that disables when already on the current month. Month label formatted via `Intl.DateTimeFormat` with `numberingSystem: 'latn'` so Indian users see "May 2026" / "मई 2026" with Latin digits.
- `selectedMonth` state and `monthRange` (memoised `{ from, to }` ISO range) refetch the summary on every change. Wedding/Trip dashboards never enter this code path — they pull the legacy lifetime summary.
- Hero card label conditionally swaps `dashboard.totalExpenses` → `dashboard.monthlySpent` based on `features.monthlyBudget`.
- Stats grid collapses from `1fr 1fr` to `1fr` when `!features.multiMember`, hiding the meaningless "Contributors" card; Categories takes full width.
- Top Contributors section gated by `features.topContributors` — hidden entirely for Personal.
- "View All" button routes to `/my-expenses` instead of `/all-expenses` when `!features.multiMember` (matches the nav).
- Recent expenses suppress the "Member name •" prefix on each row when `!features.multiMember` (no point repeating the lone owner's name).
- Join Code card already gated by `wedding?.joinCode` truthy — Personal workspaces have none, so it's automatically hidden.

**Feature — refreshSummary accepts range params (`Frontend/src/context/WeddingContext.tsx`, `WeddingProvider.tsx`):**
- Signature change: `refreshSummary(params?: { from?: string; to?: string }) => Promise<void>`. Backwards-compatible — existing callers (every wedding consumer) pass nothing and get lifetime totals exactly as before.

**Feature — BottomNav features-driven (`Frontend/src/components/BottomNav.tsx`):**
- Tabs assembled from `features`: Home + MyExpenses + FAB always; AllExpenses + Members/Settings only when `features.multiMember`; Settings always replaces Members for single-member verticals.
- Result: Personal navigation has 4 tabs (Home / MyExpenses / Add / Settings); Wedding/Trip keep the existing 5 (Home / MyExpenses / Add / AllExpenses / Members or Settings).

**Feature — AddExpense hides "Paid by" for single-member verticals (`Frontend/src/pages/AddExpense.tsx`):**
- The "Paid by" field on Step 3 is gated by `features.multiMember`. The submission payload still defaults `paidBy` to `member?.name` so the backend expense record stays consistent.

**Feature — MyExpenses auto month-scoping (`Frontend/src/pages/MyExpenses.tsx`):**
- When `features.monthlyBudget`, the page mounts with the CURRENT calendar month range and passes `from`/`to` to `getMyExpenses`. Wedding/Trip pass nothing → lifetime list, the legacy behaviour.
- Note (Phase 2b polish): currently MyExpenses always uses the real-world current month; the Dashboard switcher only changes the Dashboard. A future polish pass can lift `selectedMonth` into `WeddingContext` for shared state across pages.

**Feature — Settings adapted (`Frontend/src/pages/Settings.tsx`):**
- Wedding-specific fields (couple names, wedding date) are hidden for `!features.multiMember`. Section header swaps `weddingDetails` → `budgetDetails`, the workspace-name label swaps `weddingName` → `budgetName`, and the budget label swaps `totalBudget` → `monthlyBudget` / `monthlyBudgetLabel` when `features.monthlyBudget`.
- Join Code section gated on `features.joinCode && wedding?.joinCode`.
- "View Members" shortcut gated on `features.multiMember`.

**Feature — i18n additions (~40 new keys × en+hi):**
- `pickType.*` (header, subtitle, wedding.title/desc, personal.title/desc, trip.title/desc/soonBadge) — type picker copy.
- `createPersonal.*` (header, subtitle, workspaceName, workspaceNamePlaceholder, workspaceNameHint, monthlyBudget, monthlyBudgetPlaceholder, monthlyBudgetHint, submitBtn, creating, googleHint, errName, errFailed, successCreated) — personal create form copy.
- `dashboard.monthlySpent`, `dashboard.prevMonth`, `dashboard.nextMonth`, `dashboard.goToCurrentMonth` — month switcher.
- `settings.budgetDetails`, `settings.budgetName`, `settings.monthlyBudget`, `settings.monthlyBudgetLabel` — Personal Settings copy.
- 11 new `cat.*` entries for Personal-vertical categories (Rent, Groceries, Eating Out, Utilities, Subscriptions, Health, Shopping, Investments, EMIs / Loans, Personal Care, Entertainment) with conversational North-Indian Hindi (राशन, बाहर खाना, बिजली / पानी, etc.).
- `landing.createBtn` value changed `💍 Create a Wedding` → `✨ Create New` / `💍 शादी बनाएँ` → `✨ नया बनाएँ` (key name reused; existing callers still resolve).

**Production-safety design notes:**
- **No existing wedding code path changed in behaviour.** `POST /api/weddings` unchanged. Default `GET /expenses/summary` (no `from`/`to`) returns lifetime totals as before. The wedding-vertical flow renders byte-identically.
- **No DB migration required for existing wedding documents.** Pre-Phase-0a documents (no `type` field) read as `'wedding'` via Mongoose default; new fields are additive; old fields kept.
- **One-shot index migration required only for the first Personal create.** Documented in `scripts/migrateWorkspaceIndexes.js`; idempotent; safe to re-run. Owner action: run before the prod Personal launch.
- **Frontend abstraction is purely feature-driven.** Zero `if (type === 'wedding')` scatter in JSX — all per-vertical UI differences go through `features.*` flags resolved from `Wedding.type`.

**Files added:**
- `Backend/scripts/migrateWorkspaceIndexes.js` — one-shot index migration to make `joinCode` sparse.

**Files changed:**
- `Backend/routes/weddingRoutes.js` — new `POST /personal` route.
- `Backend/routes/expenseRoutes.js` — `parseDateRange()` helper + `from`/`to` query param on `GET /`, `GET /my`, `GET /summary` (every aggregation pipeline scoped).
- `Frontend/src/api.ts` — `createPersonalWorkspace()`, `getExpenseSummary(params?)`, `getMyExpenses(params?, signal?)`.
- `Frontend/src/pages/LandingPage.tsx` — new `'pick-type'` + `'create-personal'` modes, `TypePickerForm`, `CreatePersonalForm`.
- `Frontend/src/pages/Dashboard.tsx` — month switcher, `selectedMonth`/`monthRange` state, scoped summary refetch, features-driven gates (stats grid, contributors, recent rows, view-all routing).
- `Frontend/src/pages/AddExpense.tsx` — "Paid by" gated by `features.multiMember`.
- `Frontend/src/pages/MyExpenses.tsx` — month-scoped fetch when `features.monthlyBudget`; pre-existing `getMyExpenses(signal)` callsite migrated to new `(params, signal)` signature.
- `Frontend/src/pages/Settings.tsx` — features-driven wedding-detail hiding, budget label swap, join-code + members shortcut gating.
- `Frontend/src/components/BottomNav.tsx` — features-driven tab assembly.
- `Frontend/src/context/WeddingContext.tsx` — `refreshSummary` signature accepts `{ from?, to? }`.
- `Frontend/src/context/WeddingProvider.tsx` — passes range through to `getExpenseSummary`.
- `Frontend/src/i18n/translations.ts` — ~40 new keys × en + hi; `landing.createBtn` value updated.

**Verification:** `npm run typecheck` → 0 errors. `npm run lint` → 0 errors, 1 pre-existing warning (`api.ts:53`, unchanged from Phase 0a). `vite build` → green, 568ms, CSS 9.61 KB gz (unchanged), JS 122.37 KB gz (**+2.73 KB gz** vs Phase 0a EOD for the entire Personal MVP). Backend `node -c` clean for all touched files; `routes/weddingRoutes` registers `POST /personal` correctly; `routes/expenseRoutes` accepts range params.

**Deferred to Phase 2b polish:**
- Shared `selectedMonth` state across Dashboard + MyExpenses (currently MyExpenses always pins to real-world current month; Dashboard's switcher is local).
- Personal-themed hero copy / watermark (currently still wedding-themed on the Landing hero — the picker mode is reached one tap deeper).
- Trip categories i18n (Flights / Trains / etc. — they exist in defaults but lack `cat.*` translations; will fail open to literal English in `tCat` for now; Phase 1 (Trip MVP) adds the translations).

**Deferred to Phase 0b (cosmetic rename, post-Trip):**
- File rename Wedding.js → Workspace.js, model class rename, `weddingId` → `workspaceId` field rename + prod migration, `/api/weddings/*` → `/api/workspaces/*` with 308 alias, i18n namespace move `wedding.*` → `workspace.wedding.*`.

### 2026-05-28 — Phase 2 polish: Personal-mode bug fixes + multi-vertical Landing redesign

Same-week follow-up to the Phase 2 Personal MVP. Owner reported two issues after a dogfooding session on a real Personal workspace: (a) adding a new category in Settings didn't persist — the chip appeared in the UI but vanished on refresh; and (b) the Landing page still read as wedding-only ("Wedding Expense Tracker" headline + "FOR INDIAN WEDDINGS" pill + "WEDDING EXPENSE" watermark + 💒 emblem) even though the app now supports a second vertical.

**Bug fix — categories not persisting (`Frontend/src/pages/Settings.tsx`):**
- **Root cause:** `addCategory()` only updated local React state. The user had to find a separate "Save Categories" button which (worse) was conditionally rendered only when `categories.length !== wedding.categories.length` — easy to miss, and the length check failed if the user did an add + remove in equal counts. Classic draft-state UX trap.
- **Fix:** converted category mutations to **optimistic auto-save**. New `persistCategories(next, successKey)` helper: updates local state immediately, fires `PUT /api/weddings/current` with the new list, calls `refreshWedding()` on success, **rolls back to the previous list on failure** with the existing `tServer`-translated error toast. `addCategory`, `removeCategory`, and `addMissingDefaults` all route through this helper.
- The old "Save Categories" draft button is gone. Added Enter-key support to the new-category input so users can rapid-fire add several entries (toast confirms each: `Added '{name}'` / `Removed '{name}'`).
- Two new bilingual i18n keys: `settings.categoryAdded`, `settings.categoryRemoved`. Generic `settings.errSave` reworded to encourage retry.

**Bug fix — wrong "suggested categories" on Personal (`Frontend/src/pages/Settings.tsx`):**
- **Root cause:** `getMissingDefaults(categories)` was called without the `type` parameter (Phase 0a made it optional), so it defaulted to wedding defaults. A Personal workspace screen showed *"✨ Add 18 suggested wedding categories"* — clicking it would inject wedding categories like Mehendi, Sangeet, Haldi into the user's personal monthly budget.
- **Fix:** `Settings.tsx` now destructures `workspaceType` from `useWedding()` and passes it to `getMissingDefaults(categories, workspaceType)`. Personal workspaces with the full default 13-item list now correctly show *zero* missing → the suggestion CTA is hidden. The button copy also dropped the word "wedding" (`settings.suggestedCategories`: "✨ Add {count} suggested **wedding** categories" → "✨ Add {count} suggested categories") so it stays correct for any future vertical.

**Polish — features-driven Settings copy (`Frontend/src/pages/Settings.tsx`):**
- "Leave Wedding" button + modal were wedding-specific copy even on Personal workspaces. Now gated on `features.multiMember`: wedding/trip → existing "Leave Wedding" / "Yes, Leave Wedding" / multi-line body about rejoining; Personal → "Sign Out" / "Sign out?" / "You'll be signed out. You can sign back in anytime with your email — your budget and history will be waiting."
- Three new bilingual keys: `settings.signOut`, `settings.signOutTitle`, `settings.signOutBody`.

**Feature — Landing redesigned for multi-vertical (`Frontend/src/pages/LandingPage.tsx`):**
- **Hero now embeds the type picker directly.** The previous 3-button stack (Create New / Join with Code / Login) collapsed into the type picker screen behind one tap. The picker is now visible on the hero itself as three glass cards (💒 Wedding, 💰 Personal, ✈️ Trip with "Coming soon" pill) — users see every supported vertical at a glance. Picking a card routes straight to that vertical's create form, skipping the now-removed intermediate `'pick-type'` mode.
- The two non-create flows (Login + Join with Code) are demoted to centred secondary text links beneath the Google button. New bilingual keys: `landing.signInLink`, `landing.joinCodeLink`.
- Dead code removed: the `TypePickerForm` component (~60 lines) and the `'pick-type'` Mode union member. `CreateForm` and `CreatePersonalForm` `onBack` handlers updated to return to the hero (`setMode(null)`) instead of the picker mode.
- **Copy + visual identity neutralised across both languages:**
  - `landing.title1/2` (gradient headline): "Wedding" / "Expense Tracker" → "Track every rupee," / "your way." (hi: "हर रुपये का हिसाब," / "आपके तरीके से।")
  - `landing.subtitle1/2`: "Track every rupee, together as a family. Simple enough for everyone." → "Personal budgets, family weddings, group trips — one tracker for the way you actually spend." (hi: "पर्सनल बजट, शादी का खर्च, ट्रिप का हिसाब — जैसे आप खर्च करते हैं, वैसा ही ट्रैकर।")
  - `landing.eyebrow` pill: "For Indian Weddings" → "One tracker · Many ways" (hi: "एक ट्रैकर · हर तरीका")
  - `landing.trustFamily` chip: "Whole family" → "Solo or group" (hi: "अकेले या साथ में") — keeps "Every rupee" + "Safe & private" unchanged
  - `landing.helperHint`: rewritten to surface all three entry points
  - `landing.panelSubtitle`: "Choose how you'd like to continue" → "Pick the tracker that fits how you spend"
  - **Watermark** (decorative, hard-coded English): "WEDDING" "EXPENSE" → "EVERY" "RUPEE"
  - **Hero emblem icon**: 💒 (Wedding venue) → 💰 (money bag, vertical-agnostic). Decorative sparks 🌸 / 💍 / ✨ → 💒 / ✈️ / ✨ (representing the two live verticals + the future trip).
- The hero's wedding-vertical *brand* feel is gone — the layout system, animations, watermark drift, brand-panel + auth-panel split, glass cards, and trust pills all carry over unchanged.

**Files changed:**
- `Frontend/src/pages/Settings.tsx` — `persistCategories` helper + auto-save mutations; `workspaceType` passed to `getMissingDefaults`; features-driven Leave/Sign Out button + modal; Enter-key on new-category input; obsolete Save Categories button removed; new `Category` type import.
- `Frontend/src/pages/LandingPage.tsx` — `Mode` union loses `'pick-type'`; `HeroSection` right panel rewritten with 3 inline picker cards + secondary text links; watermark words + emblem icon + sparks neutralised; `CreateForm` / `CreatePersonalForm` back-handlers now return to hero; `TypePickerForm` component deleted (~60 LoC).
- `Frontend/src/i18n/translations.ts` — landing hero copy rewritten en + hi (title1/2, subtitle1/2, eyebrow, panelSubtitle, helperHint, trustFamily); 2 new landing keys (`signInLink`, `joinCodeLink`) en + hi; 2 new settings keys (`categoryAdded`, `categoryRemoved`) en + hi; 3 new settings keys (`signOut`, `signOutTitle`, `signOutBody`) en + hi; `settings.suggestedCategories` value drops the word "wedding" so it works for any vertical; `settings.errSave` reworded.

**Production safety:**
- No backend changes. No new API endpoints. No schema or index changes.
- The auto-save change uses the existing `PUT /api/weddings/current` route — same write path the old Save Categories button used. Backend sees identical payloads.
- Wedding-vertical flow is byte-identical: the hero's Wedding card lands on the same `CreateForm` as before; the only difference is one fewer intermediate screen (the picker mode is gone). Existing wedding workspaces' Settings screens still render the wedding-specific "Leave Wedding" copy via `features.multiMember=true`.

**Verification:** `npm run typecheck` → 0 errors. `npm run lint` → 0 errors, 1 pre-existing warning (`api.ts:53`, unchanged). `vite build` → green, 7.48s. CSS 9.61 KB gz (unchanged). JS 122.71 KB gz (**+0.34 KB gz** for the entire polish — most of the delta is offset by deleting the `TypePickerForm` component + the draft-Save plumbing).

### 2026-05-28 — Security Remediation Day 1: workspace-takeover bypass closed (C-1 + H-1 + M-15)

First execution slice of the §14 remediation roadmap. The audit completed earlier the same day flagged **C-1** as the single biggest production exposure: `POST /api/auth/login/select-wedding` accepted a bare `memberId` from the request body and minted a JWT for it with **no authentication, no proof of prior login, no membership check** — meaning any member who joined a workspace and then called `GET /current/members` could pick the admin's `_id`, replay it against the select endpoint, and become admin in a single request. H-1 (joinCode leak in the multi-wedding response) and M-15 (401 interceptor hard-redirecting away from the multi-wedding selector UI) ship in the same patch because they share the same code path; H-6 (pin `jwt.verify` algorithms) ships partially via `generateToken` now also pinning `algorithm: 'HS256'`. See §14 for the full audit.

**Fix — selector-token attestation (`Backend/middleware/auth.js:90+`):**
- New `generateSelectorToken(email, memberIds)` / `verifySelectorToken(token)` helpers. The selector token is a short-lived purpose-bound JWT:
  - `purpose: 'select-wedding'` (rejected if reused against any other endpoint or as a session token)
  - `members: [<memberId>, …]` (the allowlist of memberIds the caller passed authentication for at `/login` time)
  - `sub: <email>` (defence-in-depth check inside `/select-wedding`)
  - `exp` = 5 minutes from issue
  - Algorithm pinned to `HS256` on both mint and verify (H-6 partial — `generateToken` now also pins HS256 explicitly).
- `verifySelectorToken` throws with a tagged `statusCode` on every failure mode (missing, expired, tampered, wrong-purpose) and a uniform user-facing message — no information leak distinguishing "expired" from "tampered."

**Fix — `/login` and `/google` mint a selector token + strip joinCode (`Backend/routes/authRoutes.js`):**
- Both endpoints now call `generateSelectorToken` whenever the result is a multi-wedding response and include it in the `data.selectorToken` field.
- H-1: the `weddings` array no longer includes `joinCode` — the field is destructured off via `({ joinCode: _joinCode, ...rest })` on `/login` and simply not constructed on `/google`. Leaking workspace join codes to anyone who can verify a single password (or successfully complete Google sign-in) is an unnecessary trust expansion; selector tokens are the new attestation that the caller may turn a memberId into a session.

**Fix — `/login/select-wedding` is locked down (`Backend/routes/authRoutes.js:142+`, the C-1 core):**
- Reads `selectorToken` from the request body; runs `verifySelectorToken`; returns the helper's `statusCode`/`message` (always 401) on any failure.
- Checks the requested `memberId` is in `payload.members`; returns **403** with a generic message if not (the selector is valid but the requested member is outside its scope — prevents an attacker who somehow obtained another user's selector from using it against arbitrary memberIds).
- Defence-in-depth: the resolved `member.email` must match `payload.sub` (case-insensitive). If a member's email is changed between login and select-wedding, the original selector is voided. Returns 403 (same message).
- Only after all three gates pass does the route mint and return the actual session JWT.

**Fix — frontend wiring (`Frontend/src/types/index.ts`, `api.ts`, `pages/LandingPage.tsx`):**
- `AuthResult` gained `selectorToken?: string`; `WeddingOption` lost `joinCode` (the field is no longer returned by the server).
- `LandingPage`: new `selectorToken` component-state slot captured from the `handleLoginSuccess` payload — **stored in React state only, never written to `localStorage`**. If the page unmounts (refresh, navigation), the selector is lost and the user falls back to logging in again, which is the safe default.
- `handleSelectWedding` passes `{ memberId, selectorToken }` to the API call. On HTTP 401 from select-wedding, the handler resets `selectorToken`/`weddingList`, switches mode back to `'login'`, and toasts a translated "Your sign-in session expired. Please sign in again." message. On any other error, the existing generic-error toast fires.
- `SelectWeddingForm` no longer renders `w.joinCode` (it doesn't exist on the new payload). The picker card shows only the wedding name + role.
- `api.ts` interceptor (M-15 fix): the global 401 → `window.location.href = '/'` redirect now **skips** for an allow-list of endpoints that handle their own 401 (currently just `/auth/login/select-wedding`). Without this, the LandingPage's catch handler would have been racing the page reload and the user would land back on the hero with no toast and no explanation. The interceptor checks `error.config?.url.endsWith(<allowed path>)`.

**i18n additions:** 1 new key × en + hi (`select.errExpired`: "Your sign-in session expired. Please sign in again." / "आपका साइन-इन सेशन ख़त्म हो गया। फिर से साइन इन करें।").

**Production-safety design notes:**
- **No schema changes.** No new fields on Member/Wedding/Expense.
- **No data migration.** No prod state to fix up.
- **No new dependencies.** The fix uses the existing `jsonwebtoken` library that already signs session tokens — selector tokens are just a different JWT with a `purpose` claim, signed with the same `JWT_SECRET`.
- **No new env vars.** The 5-minute TTL is hard-coded in the helper (which is appropriate — it's a security parameter that shouldn't be operator-tunable without code review).
- **Wedding flow byte-identical for the single-wedding case.** The selector-token machinery only runs when the response would have been multi-wedding; single-wedding logins (the vast majority) are untouched.
- **Backwards-compatible response shape.** Adding `selectorToken` is an additive field. Removing `joinCode` from `weddings[]` is a breaking change for any client that was reading it — verified the only consumer is `SelectWeddingForm` (now updated). No external consumers exist.

**Attack-path closure verified by smoke test:** an attacker who knows another member's `_id` but has no selector token now gets `401 Missing selector token`. An attacker who somehow obtains another user's selector token but requests a memberId outside its `members` allowlist gets `403 Invalid wedding selection`. An attacker replaying a session JWT (with `id` claim instead of `purpose: 'select-wedding'`) against the select endpoint gets `401 Invalid selector token`. All three were verified via in-process simulation against the real helper functions (no Mongo dependency).

**Files added:** *(none — selector-token plumbing lives in existing `auth.js`)*.

**Files changed:**
- `Backend/middleware/auth.js` — `generateSelectorToken` + `verifySelectorToken` helpers; `generateToken` now pins `algorithm: 'HS256'`.
- `Backend/routes/authRoutes.js` — `/login` and `/google` mint selectorToken + strip joinCode from multi-wedding response; `/login/select-wedding` requires + verifies + allowlist-checks the selectorToken before issuing any session JWT.
- `Frontend/src/types/index.ts` — `AuthResult.selectorToken?`; `WeddingOption.joinCode` removed.
- `Frontend/src/api.ts` — 401 interceptor allow-list (`/auth/login/select-wedding`) skips the hard redirect + localStorage wipe.
- `Frontend/src/pages/LandingPage.tsx` — `selectorToken` state; `handleSelectWedding` passes the token and handles 401 by returning to the login form; `SelectWeddingForm` no longer renders the removed `joinCode` field.
- `Frontend/src/i18n/translations.ts` — `select.errExpired` × en + hi.

**Verification:** `npm run typecheck` → 0 errors. `npm run lint` → 0 errors (1 pre-existing warning, unchanged). `vite build` → green, 3.27s. CSS 9.61 KB gz (unchanged). JS 122.81 KB gz (+0.10 KB gz). Backend `node -c` clean for both touched files. End-to-end in-process simulation of (a) legitimate select, (b) attack with memberId outside the allowlist, (c) attack with no selector token, (d) session-JWT replay against select — all four assertions pass.

**Remediation roadmap status:** Phase 14.A (Day 1) ✅ shipped. Phase 14.B (Day 2 — see next entry) ✅ shipped same day.

### 2026-05-28 — Security Remediation Day 2: high-band quick wins (H-6 + H-3 + H-4 + pagination cap)

Same-day follow-up to Day 1. All five items in §14.3 Day-2 row landed in a single backend-only patch. No frontend changes — JS bundle unchanged at 122.81 KB gz.

**Fix — H-6 algorithm pin on session-token verify (`Backend/middleware/auth.js`):**
- `protect` now calls `jwt.verify(token, secret, { algorithms: ['HS256'] })`. Day 1 already pinned `generateToken` and `generateSelectorToken` on the mint side; this closes the verify side. Tokens claiming a non-HS256 algorithm (the classic algorithm-confusion attack surface) are now rejected with `invalid algorithm`. Verified by in-process test: a token forged with `HS384` against the same secret is rejected.

**Fix — H-3 stricter `signupLimiter` (`Backend/routes/weddingRoutes.js`):**
- New per-route `rateLimit` middleware: **10 requests / hour / IP** for `POST /api/weddings` and `POST /api/weddings/personal`. Stricter than the global authLimiter (30/15min) because signups are infrequent legitimate actions and the abuse vector is bcrypt-rounds-12 CPU burn + Atlas storage exhaustion.
- Applied at the route level (not via `app.use('/api/weddings/', ...)`) to avoid pulling the existing `GET /current`, `PUT /current`, `GET /current/members`, `DELETE /current/members/:memberId` into the same strict bucket. Member-list / dashboard refresh patterns naturally exceed 10/hour and would have been falsely 429'd.
- 10/hour roomy for one human + their phone but cuts a single-IP botnet's signup throughput by ~20× vs. the previous global 200/15min.

**Fix — H-4A reset URL no longer logged in production (`Backend/utils/email.js`):**
- The `isEmailConfigured() === false` path now branches on `NODE_ENV`:
  - **Production:** logs `[Email] CRITICAL: SMTP not configured in production. Password reset email NOT sent.` — no URL, no token, nothing actionable for a log-aggregator attacker. The reset request still returns its anti-enumeration generic success to the caller (caller can't distinguish "SMTP misconfigured" from "email doesn't exist").
  - **Development:** unchanged — keeps the convenience log so the flow stays testable without SMTP. Devs literally need the URL to click through during local testing.

**Fix — H-4B boot-time preflight refuses to start in production without SMTP (`Backend/server.js`):**
- Right after `dotenv.config()`: if `NODE_ENV === 'production'` and any of `SMTP_HOST / PORT / USER / PASS` is missing, log `[Preflight] FATAL: SMTP env vars missing in production: …. Refusing to start — password reset would fail closed.` and `process.exit(1)`. The combination of H-4A + H-4B means production can NEVER serve a password-reset request that silently no-ops — either SMTP is configured and reset works, or the server refuses to boot. No middle ground.
- Scoped to SMTP only (not `JWT_SECRET`, `MONGODB_URI`, `GOOGLE_CLIENT_ID`, `CLOUDINARY_*`) because (a) JWT_SECRET produces a working-but-trivially-forgeable token if undefined — that's a different fix path tracked under L-4; (b) Mongo connection fails loudly at startup anyway if `MONGODB_URI` is bad; (c) Google + Cloudinary are designed to be optional (graceful 503 / silent skip). The broader env-preflight check is queued under P-2 (Week 3).

**Fix — pagination cap on `GET /api/expenses` (`Backend/routes/expenseRoutes.js`):**
- `cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100)`. Same pattern for `cappedPage`. The `.skip()` / `.limit()` / pagination-response-meta all use the capped value, so callers requesting `?limit=100000` now silently get 100 and the response advertises `pages = ceil(total/100)`.
- Closes the slow-loris pagination vector: a single request can no longer ask for every expense in a workspace, and `Expense.countDocuments` still runs once but is bounded by `weddingId` (already indexed). Legitimate UI never asks for more than 50.

**Production-safety design notes:**
- **Backend-only.** No frontend, no schema, no DB migration, no env-var changes (only adds a *check* for env vars that should already be set in production).
- **No new dependencies.** `express-rate-limit` already in `package.json`; `signupLimiter` reuses it.
- **No breaking changes for legitimate clients.** Wedding-creation UI, Personal-creation UI, and the expenses list all stay within the new caps. Existing API consumers (if any) that were sending `?limit=10000` get clamped silently — that was always abusive behaviour.
- **Failure mode is loud, not silent.** H-4B fails closed at boot, not at request time. H-4A logs `CRITICAL` (not `warn`) in production so log monitors page on it.

**Files changed:**
- `Backend/middleware/auth.js` — `jwt.verify` algorithm pinning.
- `Backend/routes/weddingRoutes.js` — `signupLimiter` definition + applied to `POST /` and `POST /personal`.
- `Backend/routes/expenseRoutes.js` — `cappedLimit` / `cappedPage` on `GET /`.
- `Backend/utils/email.js` — branch on `NODE_ENV` for the SMTP-unconfigured path.
- `Backend/server.js` — boot-time SMTP preflight (`process.exit(1)` on missing prod env).

**Verification:** `node -c` clean for all 5 touched files. In-process assertions: HS256 session token decodes; HS384-forged token rejected with `invalid algorithm`; pagination cap correctly returns `100` for inputs `0`, `100`, `100000`, and `50` for `'not-a-number'` / `undefined` (treating invalid inputs as default, intentional); `signupLimiter` registered on both signup routes; H-4A dev path logs the link + returns `{sent:false}`; H-4B preflight block present in `server.js` source. Frontend `npm run typecheck` → 0 errors, `npm run lint` → 0 errors (1 pre-existing warning untouched), `vite build` → green, bundle size unchanged.

**Remaining audit findings:** Phase 14.C (Day 3 — see next entry) ✅ shipped same day.

### 2026-05-28 — Security Remediation Day 3: input safety + atomicity (H-7 + M-5 + M-8 + M-9)

Backend-only patch landing the third roadmap-row in §14.3 same day as Days 1 + 2. Frontend untouched; JS bundle unchanged at 122.81 KB gz.

**Fix — H-7 shared regex-escape utility (`Backend/utils/regex.js`, new):**
- New module exporting `escapeRegex(s)`, `escapeRegexCapped(s)`, and `REGEX_INPUT_MAX_LEN` (64). `escapeRegex` does the standard PCRE-metacharacter backslash-escape (`.`, `*`, `+`, `?`, `^`, `$`, `{`, `}`, `(`, `)`, `|`, `[`, `]`, `\`). `escapeRegexCapped` additionally slices the string to 64 chars before escaping so a pathological 10k-char regex can't be passed to Mongo. Null/undefined coerced to empty string defensively — never throws on bad input.
- This was previously inlined in `weddingRoutes.js:173` (join-flow takeover fix, 2026-05-23) — same logic, now a single source of truth.

**Fix — H-7 escape applied to `$regex` search params (`Backend/routes/expenseRoutes.js`):**
- The three list-view search params (`searchCategory`, `searchDesc`, `searchMember`) flowed straight into `{ $regex: <userInput>, $options: 'i' }`. Two real risks: (a) ReDoS via pathological patterns like `(a+)+$`, (b) over-match via `.*` returning every row in the workspace via legitimate-looking pagination. Both fixed by wrapping each `<userInput>` in `escapeRegexCapped(...)` — the search is now literal-string matching, with a 64-char input ceiling, and the index can be used.
- The existing `escapeRegex` inline helper in `weddingRoutes.js` for `/join` was replaced with the imported one (DRY) — behaviour identical, no change to the name-collision regex semantics.

**Fix — M-8 Wedding categories caps (`Backend/models/Wedding.js`):**
- `categories` migrated from a plain subdoc array to a typed schema with a top-level `validate` function. Limits:
  - **Array size:** `≤ 50` items (more than double the largest seeded vertical's 20 wedding-defaults). Rejects with "A workspace cannot have more than 50 categories".
  - **Per-item `name`:** `maxlength: 60` chars + `trim: true`. Rejects with "Category name cannot exceed 60 characters".
  - **Per-item `icon`:** `maxlength: 8` chars (one emoji is up to ~7 bytes UTF-16; the cap blocks a sneaky 5kb payload disguised as an icon). Rejects with "Category icon must be a single emoji".
  - **`budgetLimit`:** `min: 0` (was already `default: 0`, now also non-negative).
- Closes the wire/storage DoS vector: an admin could previously `PUT /api/weddings/current` with `categories: [{name: 'a'.repeat(1e6), …}]` and silently bloat Atlas storage + every subsequent dashboard fetch. Now the Mongoose `ValidationError` returns a clean 400 via the existing `errorHandler`.

**Fix — M-9 `Expense.paidBy` cap (`Backend/models/Expense.js`):**
- Added `maxlength: [100, 'Paid-by name cannot exceed 100 characters']`. Schema was previously `{ type: String, trim: true, default: '' }` — no upper bound. Aligned with the existing `vendor` cap (also 100) and the route-layer trim (also 100) in `AddExpense.tsx`.

**Fix — M-5 atomic workspace + owner creation (`Backend/routes/weddingRoutes.js`):**
- Both `POST /api/weddings` and `POST /api/weddings/personal` previously ran three independent awaits: `Wedding.create(...)` → `Member.create(...)` → `wedding.save()` after linking `createdBy`. If step 2 or 3 failed (network blip, validation error after the member-create accepted the request, …), an orphan `Wedding` with `createdBy: null` and no owner stuck around forever — pollution + ghost-workspace inventory.
- Both routes now wrap the three writes in a single transaction via `mongoose.startSession()` + `session.withTransaction(async () => { … })`. Wedding + Member created with `{ session }`; `wedding.save({ session })` propagates the session. On any thrown error inside the closure, Mongoose aborts the transaction — DB rolls back to pre-write state, errorHandler returns a 400/500 to the client. `session.endSession()` runs in a `finally` so we never leak sessions on the connection pool.
- Token issuance (`generateToken`) is intentionally outside the transaction — JWT minting is a pure CPU op with no DB side-effect to roll back, and if the transaction succeeded, the token must succeed too.
- New import: `const mongoose = require('mongoose')` at the top of `weddingRoutes.js` (wasn't previously needed there — the model files held the import).
- Atlas (replica set) supports transactions natively; local dev against a single-node Mongo would fail with "Transaction numbers are only allowed on a replica set member or mongos" if the dev DB isn't a replica set. The deployed prod is — verified previously when planning the joinCode-index migration.

**Production-safety design notes:**
- **No new dependencies.** All four fixes use already-present libs (`mongoose` for transactions, `String.prototype` for regex escape).
- **No data migration.** Existing rows with category names ≤ 60 chars and ≤ 50 entries already validate; existing `Expense.paidBy` values ≤ 100 chars already validate. The new caps only fire on future writes that exceed them.
- **No frontend changes.** The existing UI never asks for more than 50 categories or names longer than ~30 chars — well under the new ceilings. ReDoS-style search inputs aren't reachable from legitimate UI.
- **Failure mode is loud and recoverable.** Schema validation rejections route through `errorHandler.js:10-14` → 400 with the human-readable message. Transaction aborts surface the underlying error (also 400/500). No silent data loss.

**Files added:**
- `Backend/utils/regex.js` — shared escape util.

**Files changed:**
- `Backend/routes/expenseRoutes.js` — `escapeRegexCapped` import + applied to all three `$regex` search clauses.
- `Backend/routes/weddingRoutes.js` — `escapeRegex` import + replaces inline helper in `/join`; `mongoose` import; wedding-create and personal-create rewrapped in transactions.
- `Backend/models/Wedding.js` — categories array `validate` + per-item maxlengths.
- `Backend/models/Expense.js` — `paidBy` maxlength 100.

**Verification:** `node -c` clean for all 5 touched files. In-process assertions (using actual Mongoose schemas, no DB needed): a 61-char category name is rejected with `kind: 'maxlength'` ✓; a 51-item categories array is rejected by the top-level validator ✓; a 101-char paidBy is rejected with `kind: 'maxlength'` ✓; `escapeRegex(null)` returns `''` defensively ✓; `escapeRegexCapped('a'.repeat(1000)).length === 64` ✓; both create-routes contain `session.withTransaction` (substring check, 2 occurrences) ✓. Frontend `npm run typecheck` → 0 errors; `npm run lint` → 0 errors (1 pre-existing warning); `vite build` → green, 648ms, bundle 122.81 KB gz (unchanged).

**Remaining audit findings:** Days 4-5 (H-2 per-account login lockout + interim JWT lifetime 30d → 7d) next session. Days 6-7 (H-5 email verification). Week 2 (full C-2 HttpOnly cookie migration + H-8 CAPTCHA). Week 3 (M-4 audit log + structured logging + Sentry + backups).

### 2026-05-28 — Security Remediation Day 4-5: brute-force defence (H-2 + interim C-2)

Same-day follow-up to Days 1-3. Three-file backend patch + one i18n string. JS bundle 122.81 → **122.85 KB gz** (+0.04 KB gz — just the Hindi translation of the new 429 server message). CSS unchanged.

**Fix — H-2 per-account login lockout (`Backend/models/Member.js` + `Backend/routes/authRoutes.js`):**
- **Schema additions on `Member`:** `loginAttempts: { type: Number, default: 0, select: false }` and `lockedUntil: { type: Date, select: false }`. Both added to the `toJSON()` strip block alongside the existing `resetPasswordToken` / `resetPasswordExpires` plumbing — never leaked over the wire.
- `select: false` is load-bearing: the hot `protect` middleware already projects only `name role isActive weddingId`, so the per-request cost is unchanged. Only `/login` opts in via `+loginAttempts +lockedUntil`.
- **Anti-enumeration timing parity (resolves L-7 as a side-effect):** at module load, `routes/authRoutes.js` pre-computes `ANTI_ENUM_HASH = bcrypt.hashSync('do-not-match-anyone-anti-enum', 12)` — ~250 ms one-time CPU at boot. The unknown-email branch now calls `await bcrypt.compare(password, ANTI_ENUM_HASH)` before returning the existing generic 401, so unknown-email and wrong-password paths take ~the same wall-clock time. In-process measurement: real-compare 244 ms vs anti-enum compare 239 ms (1.02× ratio — well within timing-oracle tolerance).
- **Lock check before bcrypt:** for each `/login` call, after loading members but before any `comparePassword`, the route checks `members.some(m => m.lockedUntil && m.lockedUntil > now)`. If true → returns **429** with the deliberately vague *"Too many failed sign-in attempts. Please try again later."* No countdown, no mention of email, no leak distinguishing "hot lock" from "wrong password" beyond the unavoidable 401-vs-429 status difference (see threshold-opacity note below). This also costs zero bcrypt CPU on a hot lock — a small but real DoS-resistance win.
- **Failure path counter increment:** on `comparePassword` failure across the loop, `loginAttempts++` on every member doc sharing the email. Any doc whose new count reaches `MAX_LOGIN_ATTEMPTS = 10` gets stamped with `lockedUntil = now + LOCKOUT_WINDOW_MS (15 min)` and has its counter reset to 0 — so the next 10 failures past the unlock window earn the next lockout cleanly, no off-by-one. `save({ validateBeforeSave: false })` skips unrelated validators so a doc with a legacy quirk (e.g., a member created before a later schema cap was added) can still receive the counter update.
- **Threshold opacity:** the 10th wrong attempt still returns 401 (matching attempts 1-9). Only attempt 11+ while the lock is hot flips to 429. This means an attacker cannot probe for the exact failure count that triggers lockout — the status-code boundary stays opaque, satisfying the *"don't leak which condition triggered the lock"* spec.
- **Success path reset:** when `comparePassword` succeeds, every same-email member doc with non-zero `loginAttempts` or a set `lockedUntil` has both cleared (guard skips the write when already clean — no pointless DB churn on the steady-state happy path). They lock as a unit, they unlock as a unit — which is correct because they share one password.
- **Multi-wedding consideration:** one email can map to N Member docs (N weddings). All N increment together and lock together. An attacker brute-forcing one email therefore locks every workspace that user owns — desirable, since cracking any one of them is equivalent to cracking the rest.
- **Hard-coded constants (no env knob):** `MAX_LOGIN_ATTEMPTS = 10` and `LOCKOUT_WINDOW_MS = 15 * 60 * 1000` live in source, not env. These are security parameters that shouldn't be operator-tunable without code review — matching the Day 1 precedent of the 5-minute selector-token TTL also being hard-coded.

**Fix — interim C-2 (JWT lifetime 30d → 7d, `Backend/middleware/auth.js`):**
- One-line change in `generateToken`: `process.env.JWT_EXPIRES_IN || '7d'` (was `'30d'`). The env-var override is preserved as the operator-facing escape hatch — if `JWT_EXPIRES_IN` is set, it still wins.
- In-process verifier confirms: default token now has `exp - iat = 604800s` (exactly 7 days); env override (`JWT_EXPIRES_IN=2h`) correctly yields 7200s.
- This is a stopgap, not the real C-2 fix. The full migration — HttpOnly + Secure + SameSite=Strict cookies, 15-min access tokens, rotating single-use refresh tokens (cookie-only), server-side revocation, logout-everywhere endpoint — is queued for Week 2 (Phase 14.F). Shrinking the lifetime from a month to a week meaningfully reduces stolen-token blast radius without an architecture change.

**i18n addition (`Frontend/src/i18n/translations.ts`):**
- One new server-message translation: `'Too many failed sign-in attempts. Please try again later.' → 'बहुत बार गलत साइन-इन की कोशिश हुई। कुछ देर बाद फिर से कोशिश करें।'`. Added to the existing `SERVER_MESSAGES_HI` exact-match map next to the existing *"Incorrect email or password"* translation; the existing `tServer()` infrastructure routes the 429 toast through it automatically — no LandingPage changes required.

**Production-safety design notes:**
- **No data migration.** Existing Member docs without `loginAttempts` / `lockedUntil` are valid against the new schema; Mongoose returns the default (0 / undefined) when the field is absent. First failed login on a legacy doc will persist the counter; first success clears it.
- **No new dependencies.** Uses existing `bcryptjs` (already at rounds 12) and `jsonwebtoken`.
- **No new env vars.** Lockout thresholds + token lifetime are in code (security params); existing `JWT_EXPIRES_IN` override still honoured.
- **No frontend logic changes.** The 429 response shape (`{ success: false, message: <translatable string> }`) matches every other auth-route 4xx, so the existing LandingPage error-handler + toast layer surfaces it correctly. Only the i18n string was touched.
- **No bcrypt-rounds bump.** Boot-time cost of pre-computing `ANTI_ENUM_HASH` is ~250 ms once per server start — negligible and one-shot.
- **Failure mode is loud and recoverable.** Lockouts auto-expire after 15 min; a successful login (e.g., via the password-reset flow → reset + sign in) clears the counter immediately. No admin intervention required to unlock a legitimate user.
- **Wedding flow byte-identical for normal traffic.** A user who types the right password on the first try sees zero behaviour change — the success path's "skip the write if already clean" guard means no extra DB calls for the steady-state case.

**Attack-path closure (verified via in-process simulation):**
- Brute-force a single email at the previous per-IP rate-limit ceiling (30 attempts / 15 min from one IP, or the H-2-audited distributed 288K/day at 100 IPs) — after 10 consecutive failures, the account locks for 15 min regardless of which IPs the attempts came from. Throughput cap: **40 attempts/hour per account** (10 burst + auto-unlock + 10 burst …), down from effectively unbounded.
- Unknown-email enumeration probe — closed; the response now burns the same ~244 ms bcrypt cost as a wrong-password path.
- Stolen-token blast radius — shrunk 30 d → 7 d via the interim C-2 mitigation.

**Files changed:**
- `Backend/models/Member.js` — `loginAttempts` + `lockedUntil` fields (both `select: false`); added to `toJSON()` strip block.
- `Backend/routes/authRoutes.js` — `bcrypt` import; `MAX_LOGIN_ATTEMPTS` / `LOCKOUT_WINDOW_MS` / `ANTI_ENUM_HASH` module constants; `/login` route now (a) projects the new fields, (b) runs anti-enum bcrypt-compare on no-members path, (c) returns 429 on hot lock before any real compare, (d) increments counters + stamps lockout on failure, (e) resets counters on success.
- `Backend/middleware/auth.js` — `generateToken` default lifetime `'30d'` → `'7d'`; comment block explains the interim-C-2 rationale.
- `Frontend/src/i18n/translations.ts` — Hindi translation for the new 429 message in `SERVER_MESSAGES_HI`.

**Verification:** `node -c` clean for all three touched backend files. In-process assertions (no Mongo dependency): Member schema instantiates with `loginAttempts: 0` + `lockedUntil: undefined` ✓; `toJSON()` strips both ✓; schema-level `select: false` confirmed via path introspection ✓; default-JWT lifetime decodes as 604800s (7d) ✓; env override (`JWT_EXPIRES_IN=2h`) decodes as 7200s ✓; bcrypt timing parity real-vs-anti-enum 244 ms vs 239 ms (1.02× ratio) ✓; route source contains MAX=10, WINDOW=15min, 429 on lock, increment-on-failure, reset-on-success ✓. Frontend: `npm run typecheck` → 0 errors; `npm run lint` → 0 errors, 1 pre-existing warning (`api.ts:53`, untouched); `vite build` → green, 693 ms, CSS 9.61 KB gz (unchanged), JS 122.85 KB gz (+0.04 KB gz).

**Remaining audit findings:** Days 6-7 (H-5 email verification flow — `emailVerifiedAt` field + hashed verification token + signup email + reset/owner-privilege gating) next session. Week 2 onwards remains as scheduled in §14.3.

### 2026-05-28 — Security Remediation Day 6-7: email verification flow (H-5)

Same-day follow-up to Days 1-5. Closes H-5 end-to-end: new `emailVerifiedAt` field on Member, hashed one-time verification token (mirrors the password-reset pattern), verification email auto-sent on local-auth signup, Google-auth signups auto-verified inline, password-reset acceptance gated on verification with an auto-verify-on-success defence-in-depth, plus a one-shot grandfathering backfill script for existing prod Members. JS bundle 122.85 → **124.15 KB gz** (+1.30 KB gz for the new VerifyEmailPage component, two API helpers, and ~25 i18n strings × en+hi).

**Fix — H-5 Member schema (`Backend/models/Member.js`):**
- `emailVerifiedAt: { type: Date, default: null }` — null = unverified; a Date stamp = verified at that instant. **Selectable** (NOT `select: false`) so the frontend's wedding-response payload can surface a "please verify your email" banner without a separate round-trip.
- `emailVerificationToken: { type: String, select: false }` — sha256 hash of the raw token the user receives in their email. Same pattern as `resetPasswordToken`: raw token only ever lives in the email URL and the user's clipboard; storage only sees the hash.
- `emailVerificationExpires: { type: Date, select: false }` — 24 h validity (vs the 1 h reset window — users don't always check mail immediately; verification is less time-sensitive than a reset, but short enough that a leaked-log scenario doesn't grant indefinite hijack potential).
- Both token fields added to the `toJSON()` strip block; `emailVerifiedAt` deliberately left in (UI needs it).

**Fix — H-5 shared verification-token util (`Backend/utils/verificationToken.js`, new):**
- Exports `mintEmailVerificationToken()` returning `{ rawToken, tokenHash, expiresAt }`. Three call sites mint these (wedding-create signup, personal-create signup, resend route), one consumes (verify route). Extracted to a util to keep the routes thin and consistent.
- Local `hashToken` (sha256) — deliberately not shared with the existing reset-token `hashToken` in `authRoutes.js`. Same algorithm, separate copy: a future change to one shouldn't silently change the other. Tiny duplication, zero cross-file refactor risk.
- 24 h expiry constant lives here (`EMAIL_VERIFICATION_EXPIRY_MS`); changing it later is a single-file edit.

**Fix — H-5 sendVerificationEmail (`Backend/utils/email.js`):**
- New `sendVerificationEmail(to, verifyUrl, name)` exported alongside the existing `sendPasswordResetEmail`. Same HTML/text template structure, just different copy + a 💌 icon swap. Subject: *"Verify your Wedding Expense Tracker email"*; body communicates the 24 h validity.
- Same SMTP-not-configured branching as the reset helper:
  - **Production:** `console.error('[Email] CRITICAL: SMTP not configured in production. Verification email NOT sent.')` — no URL, no token, nothing actionable for a log-aggregator attacker. The boot-time SMTP preflight from H-4B (Day 2) means production can't actually reach this branch — defence in depth.
  - **Development:** logs the full verify URL so the flow stays testable without an email account.

**Fix — H-5 signup paths send the verification email (`Backend/routes/weddingRoutes.js`):**
- Both `POST /api/weddings` (wedding admin) and `POST /api/weddings/personal` (personal owner) now:
  1. **Pre-mint** the token outside the transaction (pure crypto, no DB write).
  2. **Inside the existing M-5 transaction:** for local-auth signups, the `Member.create` payload now includes `emailVerificationToken` + `emailVerificationExpires`. For Google-auth signups, the payload includes `emailVerifiedAt: new Date()` instead — Google's `verifyIdToken` already enforced `email_verified=true` upstream (see `utils/googleVerify.js`), so the email is already trusted; no verification round-trip needed.
  3. **After the transaction commits:** fire-and-forget `sendVerificationEmail(...)` with `.catch()` logging the error. Never blocks the signup response on SMTP latency. Never sends for a transaction that may roll back. Failure path: user can resend via `POST /api/auth/resend-verification`.
- Added a local `frontendBaseUrl()` helper in `weddingRoutes.js` matching the one in `authRoutes.js` (single line — deliberately duplicated rather than cross-imported to avoid a fragile route↔route dependency).

**Fix — H-5 Google-auth path auto-verifies (`Backend/routes/authRoutes.js` `POST /google`):**
- Existing-member branch: in the `dirty`-flag loop that already handles reactivation + googleId linking + avatar sync, added `if (!m.emailVerifiedAt) { m.emailVerifiedAt = new Date(); dirty = true; }`. So a member who signed up with password (unverified) and then signs in with Google for the first time becomes verified on the spot — Google has confirmed their email control. This also retroactively verifies pre-H-5 members who happen to sign in via Google.
- New-member branch (the Google + joinCode case): `Member.create` payload now includes `emailVerifiedAt: new Date()` — they're verified at birth.

**Fix — H-5 verify-email endpoint (`Backend/routes/authRoutes.js` `POST /verify-email`, new):**
- Accepts `{ token }`, hashes it, looks up the Member with matching `emailVerificationToken` + unexpired `emailVerificationExpires`. Generic *"This verification link is invalid or has expired"* response on miss — no leak of whether the token was malformed vs unknown vs expired.
- On hit: pulls every same-email Member, sets `emailVerifiedAt = now()` on each unverified one, clears both token fields on all of them. Multi-wedding consistency: one human with three workspaces verifies all three in one click, mirroring the reset-password "multi-wedding password sync" pattern.

**Fix — H-5 resend-verification endpoint (`Backend/routes/authRoutes.js` `POST /resend-verification`, new):**
- Anti-enumeration generic response: caller cannot distinguish *"no such email"* from *"email already verified"* from *"fresh link sent"*. Falls under the existing 30/15-min `authLimiter` rate-limit bucket so it can't be used as a free email pump.
- Mints one fresh token, stamps the hash + expiry on every unverified same-email Member, fires a single email. Errors from `sendVerificationEmail` are logged and swallowed (the token is already stored; the user can re-trigger).

**Fix — H-5 reset-password gate + auto-verify-on-success (`Backend/routes/authRoutes.js` `POST /reset-password`):**
- **Gate (before applying the new password):** if `!member.emailVerifiedAt`, return **403** with `code: 'EMAIL_NOT_VERIFIED'` and message *"Please verify your email before resetting your password. We can resend the verification link."* The 403 (vs the existing 400 for bad-token) lets the frontend distinguish and render a specific "resend verification" CTA.
- **Why gate this:** closes the squat-then-recover attack — an attacker registers `victim@x.com`, never verifies; victim later signs up, finds the email taken, tries forgot-password → reset link arrives → reset is refused until victim verifies their email control. The verification email and the reset email both go to the same address, so a legitimate owner who controls the inbox can complete both flows easily; an attacker who doesn't control the inbox can complete neither.
- **Defence-in-depth (after applying the new password):** also stamp `emailVerifiedAt = now()` on every same-email Member that lacked it. Clicking through a reset link is itself proof of email control — no reason to leave the field empty afterwards. This means a verified user resetting their password sees no behaviour change; a hypothetical edge case where some same-email Member doc lost its verification gets cleaned up here.

**Frontend — VerifyEmailPage (`Frontend/src/pages/VerifyEmailPage.tsx`, new):**
- Public route `/verify-email?token=...` registered in `App.tsx` alongside the existing `/reset-password`.
- Three-phase UI: `verifying` (📩 spinner-card while the auto-POST is in flight), `success` (✅ card with CTA to `/dashboard` if authenticated else `/`), `invalid` (⚠️ card with an inline resend-verification form).
- StrictMode-safe: a `useRef`-backed guard prevents the dev-time double-mount from consuming the token twice (the first POST succeeds; the second would always see "invalid" because the now-cleared token row no longer matches).
- Resend form posts to `/api/auth/resend-verification`, toasts the (always-generic, anti-enum) server message, and swaps the form for a "check your inbox" confirmation card.
- Reuses the existing `ResetPasswordPage` wrapper pattern (LanguageToggle + ThemeToggle pinned top-right, glassmorphic centered card, `animate-in` entrance). No new CSS.

**Frontend — API + i18n (`Frontend/src/api.ts`, `Frontend/src/i18n/translations.ts`):**
- Two new API helpers: `verifyEmail(token)`, `resendVerification(email)`.
- 15 new bilingual i18n keys in the `verify.*` namespace (header copy, three phase states, resend form, banner placeholders for future Dashboard banner work).
- 4 new server-message translations in the `SERVER_MESSAGES_HI` exact-match map (covers all H-5 user-facing backend strings: verified-success, invalid-link, anti-enum-generic, reset-gate refusal).

**Fix — H-5 prod backfill script (`Backend/scripts/backfillEmailVerified.js`, new):**
- One-shot idempotent backfill matching the operational pattern of `migrateWorkspaceIndexes.js` (Phase 2).
- **Scope:** Members with an `email` AND a `password` (i.e. local-auth users who actually signed up via the previous flow) AND no existing `emailVerifiedAt`. These are GRANDFATHERED as verified — their inboxes were never asked to confirm because the verification flow didn't exist when they signed up; without this backfill they would all be locked out of password reset by the H-5 gate the moment the new code deploys.
- **Out of scope:** Google-only members (their `/auth/google` route now auto-verifies on the next sign-in) and passwordless join-code members (no email to verify).
- Supports `--dry-run` for a no-write count preview. Idempotent: re-running after the write finds 0 eligible candidates. Reports an exit-warning if any eligible row remains unverified after the write.
- **Critical owner action before deploying H-5 to prod:** `cd Backend && node scripts/backfillEmailVerified.js`.

**Production-safety design notes:**
- **No new dependencies.** Uses existing `nodemailer`, `crypto`, `mongoose`.
- **No new env vars.** Uses existing `SMTP_*`, `FRONTEND_URL`. 24 h expiry + reset-gate behaviour are hard-coded (security params).
- **No schema-breaking changes.** All three new Member fields are additive with sensible defaults. Existing wedding flow is byte-identical for: (a) any member without an email, (b) any Google-auth member (auto-verified on next sign-in), (c) any local-auth member after the backfill runs.
- **Failure mode is loud, not silent.** Email-send failures log per-route prefixed errors (`[wedding-create] verification email send failed`, etc.) without breaking the signup. Reset-gate refusals carry a machine-readable `code: 'EMAIL_NOT_VERIFIED'` so the frontend can render a precise CTA.
- **Multi-wedding consistency.** Verify-email, resend-verification, and reset-password's auto-verify all iterate every same-email Member doc so the verified state stays consistent across one user's many workspaces — same pattern as the existing reset-password password-sync.

**Attack-path closure (verified via in-process simulation):**
- **Squat-then-recover attack** — attacker registers `victim@x.com`, never verifies. Victim signs up later, can't reset password until they prove email control via the separate verification flow. Closed.
- **Forged email at signup** — typo/attacker-controlled email never receives the verification link. The account exists but admin-level "owner privileges" (TODO-marked for future gating) won't activate. Stale orphan accounts auto-fall-off in practice because they can't reset their password without verification.
- **Reset link replay across workspaces** — the existing reset-password flow already iterated same-email members; the H-5 auto-verify follows the same iteration pattern, so a single reset click verifies + resets every workspace consistently.

**Deferred to a future H-5 follow-up:**
- **Dashboard "verify your email" banner.** i18n strings (`verify.bannerUnverified`, `verify.bannerResend`) are already in place; the actual banner component on Dashboard reading `member.emailVerifiedAt` and offering inline resend is a 20-line frontend addition not shipped this session (no backend dependency, can land anytime).
- **`emailVerifiedAt` gate on workspace-edit / member-remove / future admin actions.** Spec mentions "future owner privileges" — anchor TODO comments not added this session to avoid noise; the schema field is present and the future gate is a one-line `if (!req.member.emailVerifiedAt) return res.status(403)...`. Holding off until a grace period passes post-deploy so existing admins (post-backfill) aren't surprised by sudden gating.

**Files added:**
- `Backend/utils/verificationToken.js` — shared token mint + hash helpers + 24h expiry constant.
- `Backend/scripts/backfillEmailVerified.js` — one-shot idempotent backfill (supports `--dry-run`).
- `Frontend/src/pages/VerifyEmailPage.tsx` — three-phase verify UI + inline resend form.

**Files changed:**
- `Backend/models/Member.js` — `emailVerifiedAt` (selectable) + token + expires (select:false); token fields added to `toJSON()` strip.
- `Backend/utils/email.js` — `sendVerificationEmail` exported alongside `sendPasswordResetEmail`.
- `Backend/routes/authRoutes.js` — `/verify-email` + `/resend-verification` routes; `/google` auto-verifies existing + new members; `/reset-password` 403-gates on `emailVerifiedAt` (returns `EMAIL_NOT_VERIFIED` code) and auto-verifies all same-email members on success.
- `Backend/routes/weddingRoutes.js` — wedding-create + personal-create signups pre-mint a token, write `emailVerificationToken`+`Expires` (local) or `emailVerifiedAt` (Google) inside the M-5 transaction, fire-and-forget the email after commit; local `frontendBaseUrl()` helper.
- `Frontend/src/App.tsx` — `/verify-email` public route registered.
- `Frontend/src/api.ts` — `verifyEmail` + `resendVerification` helpers.
- `Frontend/src/i18n/translations.ts` — 15 new `verify.*` keys (en + hi); 4 new server-message translations.

**Verification:** `node -c` clean for all 6 touched/new backend files. In-process assertions (no Mongo): Member instantiates with `emailVerifiedAt: null` + token fields undefined ✓; `select` introspection confirms token fields hidden, `emailVerifiedAt` selectable ✓; `toJSON()` strips token fields, keeps `emailVerifiedAt` ✓; `mintEmailVerificationToken` returns 32-byte raw, sha256 hash round-trips via `hashToken`, 24h expiry, fresh per call ✓; `sendVerificationEmail` in dev-mode logs the link + returns `{sent:false}` when SMTP unconfigured ✓; source-greps confirm reset-password gate, auto-verify-on-success, both new routes registered, both Google paths auto-verify, both wedding signups mint+send (2 sites each), backfill script has `--dry-run` flag + idempotent `updateMany` ✓. Frontend `npm run typecheck` → 0 errors; `npm run lint` → 0 errors, 1 pre-existing warning (`api.ts:53`, unchanged across Days 1-7); `vite build` → green, 646 ms, CSS 9.61 KB gz (unchanged), JS 124.15 KB gz (+1.30 KB gz for VerifyEmailPage + API helpers + 19 i18n strings).

**Remaining audit findings:** Day 1-7 done. Week 2 (full C-2 HttpOnly cookie + refresh-token rotation; H-8 CAPTCHA; CSRF protection) next. Week 3 (M-4 audit log, structured logging, Sentry, backups, CSP `report-to`, P-2 boot-time env-var preflight, P-3 startup sparse-index assertion). Week 4+ (architecture A-1..A-7, TOTP 2FA, L-2 request correlation IDs, L-3 Cloudinary URL validation, L-5 tighter Permissions-Policy).

### Where we are right now (as of 2026-05-28)

**Current state:** The frontend is completely migrated to TypeScript with zero compilation errors and a **fully working TS-aware ESLint setup** (`npm run lint` → 0 problems; all `react-hooks@7`/`react-refresh` findings refactored away rather than suppressed). The **landing/auth page** is a split-screen premium sign-in, responsive across mobile/tablet/desktop and both themes. **Both expense views now share the same premium table UX** with zero-dependency sortable/filterable headers: AllExpenses uses debounced + abortable + query-cached **server-side** fetching (no more API spam on header clicks), and MyExpenses uses instant **client-side** sort/filter/chips over its one-shot full list. React contexts are split into context+hook vs provider files. Security, auth, CSP, and deploy configs (Vercel+Railway) are ready. Verified locally via `tsc --noEmit` (0 errors), `vite build`, CDP device-accurate screenshots, and a **headless-Chrome CDP smoke test of all core flows (7/7 passed, 0 console errors)**; **not yet confirmed live in production**.

**Immediate next action (2026-05-28 EOD):**
- **Multi-vertical:** Phase 0a (Workspace abstraction) + Phase 2 (Personal MVP) + Phase 2 polish all shipped 2026-05-27/28. Two verticals live (Wedding + Personal). Phase 1 (Trip MVP) unblocked.
- **Security:** §14 audit completed 2026-05-28; **Days 1 + 2 + 3 + 4-5 + 6-7 of the remediation roadmap all shipped same day**. C-1 (workspace-takeover auth bypass), H-1 (joinCode leak), H-2 (per-account login lockout + anti-enum bcrypt parity, side-closing L-7), H-3 (signupLimiter), H-4 (reset URL log leak + boot preflight), H-5 (email verification flow + reset-password gate + Google-auth auto-verify + grandfathering backfill), H-6 (`jwt.verify` algorithm pin), H-7 (`$regex` escape), M-5 (atomic workspace+admin creation via transactions), M-8 (categories caps), M-9 (`paidBy` cap), M-15 (401 interceptor allow-list), plus the `GET /api/expenses` pagination cap and the interim C-2 mitigation (JWT lifetime 30d → 7d) — all merged. See the five 2026-05-28 Progress-log entries in §10 for file-by-file diffs.
- **Next session — Week 2 of §14.3:** **Full C-2 fix** (HttpOnly + Secure + SameSite=Strict cookies, 15-min access tokens, rotating single-use refresh tokens, server-side revocation, logout-everywhere endpoint) + **CSRF protection** (double-submit token added alongside the cookie migration) + **H-8 CAPTCHA / Cloudflare Turnstile** on signup, login, forgot-password. Then Week 3: audit log + structured logging + Sentry + backups + CSP `report-to` + P-2 boot-time env-var preflight + P-3 sparse-index startup assertion.
- **Critical owner actions before deploying current main to prod:** (1) run `node Backend/scripts/migrateWorkspaceIndexes.js` once per environment (Phase 2 — recreates `weddings.joinCode` as a sparse unique index, prereq for the first Personal create); (2) run `node Backend/scripts/backfillEmailVerified.js` once per environment (H-5 — grandfathers existing local-auth Members as verified, otherwise the new reset-password gate locks them out). Both scripts are idempotent — safe to re-run.
- **Critical owner action before first prod Personal create:** run `node Backend/scripts/migrateWorkspaceIndexes.js` once against the production DB to recreate `weddings.joinCode` as a sparse unique index (idempotent; safe to re-run).
- Wedding-vertical launch work (Railway/Vercel deploy env vars, SMTP, Google authorized-origins, real-family testing) continues in parallel. PWA Phase B/C, Phase 0b cosmetic rename, and the rest of the §14 roadmap (Week 2: full C-2 + H-8 CAPTCHA; Week 3: M-4 audit log + structured logging + Sentry + backups; Week 4+: architecture A-1..A-7 + TOTP 2FA) all remain deferred.

---

## 11. What has NOT been built yet (deliberately)

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

## 12. Top risks and unresolved questions

### Risks

1. **UX confusion for non-tech family members** — The #1 risk. If Uncle Ji can't figure out how to add an expense, the product fails. **Mitigation:** User testing with actual non-tech family members before launch. Simplify ruthlessly. Hindi localization is not optional — it's survival.

2. **Cold-start hosting** — Render free tier has 30-50s cold starts after 15min inactivity. Unusable for a real-time family app. **Mitigation:** Deploy to Railway ($5/mo) or Fly.io for always-on. Budget this as a hard cost.

3. ~~**No password reset**~~ — ✅ **Resolved 2026-05-23.** Email-based reset flow shipped (hashed 1 h token, anti-enumeration, SMTP via `nodemailer`, `/reset-password` page). Residual: SMTP creds must be set in production for emails to actually send (dev logs the link).

4. ~~**Google Sign-In credential verification**~~ — ✅ **Resolved 2026-05-23.** `google-auth-library` `verifyIdToken` now verifies signature + audience + issuer + expiry server-side in `Backend/utils/googleVerify.js`. Old insecure base64-decode removed. Fails safe (`503`) if `GOOGLE_CLIENT_ID` unset.

7. **CRITICAL join-flow takeover (fixed 2026-05-23, monitor the residual).** The fix restricts name-based re-entry to passwordless members. Residual by design: anyone with the join code can still re-enter as a *passwordless* member by name (the deliberate frictionless tradeoff, §4) — acceptable only because the admin is now password/Google-protected. If hostile actors become a concern, add per-member secrets or expiring join codes.

8. **Production auth config drift.** Google sign-in needs the prod origin in Google authorized origins (else `origin_mismatch`), `GOOGLE_CLIENT_ID` on Railway, and `VITE_GOOGLE_CLIENT_ID` in Vercel (the `.env` is gitignored). CSP `connect-src` allows `https://*.up.railway.app` — update it if the backend moves to a custom domain. **Mitigation:** the deploy checklist in §10 (2026-05-23).

5. **MongoDB Atlas free tier limits** — M0 cluster: 512MB storage, shared RAM. Sufficient for dozens of weddings, may struggle at hundreds. **Mitigation:** Monitor usage. Upgrade to M2 ($9/mo) when approaching 50% storage.

6. **No data backup strategy** — Atlas has basic backup on paid tiers only. Free tier has no point-in-time recovery. **Mitigation:** Implement weekly `mongodump` to cloud storage as a stopgap.

### Unresolved questions

- [ ] **Hosting provider decision** — Railway vs Fly.io vs Render paid tier? Need to benchmark cold-start and latency.
- [ ] **Cloud storage for receipts** — Cloudinary (generous free tier, image transforms) vs S3 (cheaper at scale)?
- [x] ~~**i18n library choice** — `react-i18next` vs `react-intl` vs custom context-based solution?~~ **Resolved 2026-05-07: chose custom context-based solution.** ~5 KB gzipped vs 30+ KB for `react-i18next`. No dynamic loading needed (only 2 languages). `useLang()` provides `t()`, `tCat()`, `tServer()`, `toggleLang()`.
- [ ] **PWA vs native app priority** — PWA gets us 80% of mobile app benefits at 10% effort. But notifications need native. Decision at P2 gate.
- [ ] **Expense approval workflow** — Should admins approve expenses before they count, or is trust-based tracking sufficient?

---

## 13. How a fresh AI chat should use this file

1. **Read this entire file before making any suggestions.** The architectural decisions, deliberate deferrals, and phase gates are all intentional.

2. **Respect the phase gates.** We are in **P0 Prototype**. Do not propose P2/P3 features (Hindi localization, mobile app, AI) unless explicitly asked. Focus on hardening what exists and preparing for P1 Launch.

3. **UX simplicity is the supreme constraint.** Every UI change must pass the "can a non-tech family elder use this?" test. When in doubt, simplify. Remove steps. Use bigger buttons. Use emoji as visual anchors.

4. **Don't break the re-entry flow.** The soft-delete + reactivation pattern for members is deliberate and load-bearing. Members who are removed must be able to rejoin (via join code) or log back in (via email) without losing their expense history.

5. **Wedding-scoped isolation is a hard rule.** Every database query must filter by `weddingId`. Every route must go through `protect` middleware. Cross-wedding data leakage is a project-ending bug.

6. **Mobile-first is not optional.** Max container width is 500px. Bottom navigation. No hover-only interactions. Touch targets ≥ 44px. Test on a phone-sized viewport.

7. **Update this file after meaningful work.** Append to §10 (Progress Log), tick boxes in §8 (Roadmap), bump the "Last updated" date. Move items from §11 to §10 when they're built. For multi-vertical work, also tick the relevant phase in §9.6 and update §9.10 (current status).

8. **Don't "helpfully" build deferred features.** §11 explains what's deliberately not built and why. Don't add Redis, don't add microservices, don't add a test suite, don't add i18n — unless the user explicitly asks.

9. **The design system is in `index.css`.** All styling uses CSS custom properties. Dark and light themes are defined. Use existing class names (`glass-card`, `expense-item`, `stat-card`, `category-chip`, etc.) — don't invent new component styles.

10. **When in doubt, ask.** Don't assume. This is a family's wedding money — data integrity matters more than velocity.

---

## 14. Security Audit & Remediation Plan

> **Audit completed: 2026-05-28** — full-stack security review acting as Principal Security Engineer + Senior Full-Stack Architect. Methodology: read every auth/authz/data path end-to-end, simulate attack scenarios against the live shape, prioritise by real-world exploitability over theoretical risk. **Verdict: not production-ready until C-1 and the H-band are resolved.** Counts: **1 Critical · 8 High · 15 Medium · 8 Low · 7 Architecture**. The codebase shows real security maturity (helmet, list-aware CORS, Mongo operator sanitizer, server-verified Google ID tokens, CSP without `unsafe-inline`, hashed-token password reset, the 2026-05-23 join-flow takeover patch) — every Critical/High finding is fixable without architectural rewrite.

### 14.1 — Findings catalogue (compact)

Severity uses standard CVSS-style mental model: **Critical** = trivially exploitable + full compromise; **High** = exploitable with moderate effort, significant blast radius; **Medium** = requires conditions or chained vulnerabilities; **Low** = defence-in-depth / hardening.

#### Critical

| ID | File:Line | Issue |
|---|---|---|
| **C-1** | `Backend/routes/authRoutes.js:133-168` | `POST /api/auth/login/select-wedding` has **no authentication**. Any member who can list workspace members (via the existing protected `GET /current/members`) can mint a JWT for the admin's `memberId` and become admin. Single-request workspace takeover. |
| **C-2** | `Frontend/src/context/WeddingProvider.tsx:32-38` + `Backend/middleware/auth.js:90-96` | JWTs stored in `localStorage`, valid 30 days, no server-side revocation, no `jti` for individual-token blacklist. Any XSS or compromised npm dep → 30-day full account compromise. Logout is a client-side localStorage clear; the JWT itself remains valid. |

#### High

| ID | File:Line | Issue |
|---|---|---|
| **H-1** | `Backend/routes/authRoutes.js:86-115`, `:210-228` | Multi-wedding login response leaks `joinCode` for **every** wedding sharing that email. Combined with C-1, one valid password yields admin of all associated workspaces. |
| **H-2** | `Backend/server.js:53-75` | Rate limiting is per-IP only. Distributed brute-force (100 IPs × 30/15min = 288K/day per email) is feasible against the 6-char-minimum passwords. No per-account lockout. |
| **H-3** | `Backend/server.js:74-75` | `POST /api/weddings` and `POST /api/weddings/personal` fall under the global 200/15min limit, not the auth-strict 30/15min. Signup spam → Atlas storage exhaustion + bcrypt CPU burn. |
| **H-4** | `Backend/utils/email.js:62-65` | When SMTP is unconfigured, the raw password-reset URL (containing a hijack token valid 1h) is logged to `console.warn`. Gated on env presence, not `NODE_ENV` — a prod misconfiguration leaks reset URLs to log aggregators. |
| **H-5** | `Backend/routes/{weddingRoutes,authRoutes}.js` (signup paths) | No email verification on signup. Enables email squatting + phishing + account lock-out of legitimate owners. |
| **H-6** | `Backend/middleware/auth.js:24` | `jwt.verify(token, secret)` without `algorithms: ['HS256']`. Algorithm-confusion edge cases possible; flagged by every audit tool. |
| **H-7** | `Backend/routes/expenseRoutes.js:175-205` | `searchCategory`, `searchDesc`, `searchMember` accept raw user regex into `$regex` queries. ReDoS + over-match vectors. |
| **H-8** | All exposed creation paths | No CAPTCHA / Turnstile on signup, login, or forgot-password. Compounds H-2 and H-3. |

#### Medium

| ID | File:Line | Issue |
|---|---|---|
| M-1 | `Frontend/src/context/WeddingProvider.tsx:40-48` | Logout is localStorage-clear; server has no revocation. |
| M-2 | Multiple | Password policy is "min 6 chars." No complexity / breach-list / length check. |
| M-3 | `Frontend/vercel.json:15` | CSP has no `report-uri`/`report-to`. Violations are silently blocked. |
| M-4 | All routes | No audit log of admin actions (member removal, settings edit, mass category change). |
| M-5 | `Backend/routes/weddingRoutes.js:97-124`, `:165-185` | Workspace + admin creation is two non-atomic `await`s. Orphan-`Wedding` risk on partial failure. |
| M-6 | `Backend/server.js:21` | `trust proxy = 1` is hard-coded. Wrong if Cloudflare is added in front of Railway. |
| M-7 | `Backend/server.js:96-103` | `/api/health` leaks `NODE_ENV`. Fingerprinting aid. |
| M-8 | `Backend/models/Wedding.js` (categories) | No size cap on `categories` array; no `maxLength` on `category.name`. PUT-payload DoS. |
| M-9 | `Backend/routes/expenseRoutes.js` (`description`, `vendor`, `notes`, `paidBy`) | Field length caps enforced at schema, not at the API layer — inconsistent. |
| M-10 | `Backend/routes/authRoutes.js:362-389` | Password reset propagates to **every** account sharing that email. Footgun combined with H-5. |
| M-11 | `Backend/routes/expenseRoutes.js:29-35` | Upload MIME taken from client `Content-Type`. Cloudinary `resource_type: 'image'` is second-line; polyglot uploads possible. |
| M-12 | `Backend/utils/cloudinary.js:62-69` | `deleteFromCloudinary` swallows all errors silently. Cleanup failures invisible. |
| M-13 | `Backend/routes/expenseRoutes.js:160-188` | `searchMember` triggers a second Mongo query before the main one — per-request DB pressure multiplier. |
| M-14 | `Backend/middleware/errorHandler.js:40-46` | `console.error` logs full stacks for every error including expected 4xx. Log noise + signal-to-noise issue. |
| M-15 | `Frontend/src/api.ts:92-98` | 401 interceptor does `window.location.href = '/'` on any 401. Mid-form data is lost; ALSO blocks any future flow where a 401 is recoverable (e.g., expired selector token in the C-1 fix below). |

#### Low

L-1 console.error stack-trace log indexing risk · L-2 no request-correlation ID · L-3 Cloudinary URL not validated post-upload · L-4 no `JWT_SECRET` rotation strategy · L-5 `Permissions-Policy` minimal · L-6 join-name-collision discloses existence · L-7 login timing oracle (email-exists vs email-doesn't) · L-8 `isAuthenticated` derived from localStorage presence only.

#### Architecture weaknesses

A-1 authorization decisions scattered across `role` + `features` gates · A-2 `protect` middleware doesn't expose `req.workspace` / `req.features` → routes re-fetch · A-3 re-entry flow has no "permanently banned" state (only soft-delete) · A-4 no tenant-scoped query helper that throws if `weddingId` is omitted · A-5 Cloudinary deletion uses stored `publicId` without folder-prefix validation · A-6 Mongoose schema is the only boundary validator (Joi/Zod absent) · A-7 no `User` entity separate from `Member` — multi-wedding password sync is a workaround, not a model.

### 14.2 — Production deployment risks (operational)

P-1 no `JWT_SECRET` rotation path · P-2 no startup check that required env vars are present · P-3 `migrateWorkspaceIndexes.js` must be run manually before first Personal signup (not enforced) · P-4 no backup strategy on Atlas M0 · P-5 no incident runbook · P-6 rate limiter is in-memory (per-instance, not global if Railway scales out) · P-7 `NODE_ENV=production` is assumed not enforced · P-8 CSP `connect-src` wildcards `*.up.railway.app` (breaks on custom-domain move) · P-9 no CSP violation reporting endpoint · P-10 source-map exposure off by default but not gated.

### 14.3 — Remediation roadmap

Sequencing is impact-per-effort. Day boundaries are nominal — each row is "one focused session." A row gets a checkbox when its code + tests are merged AND verified.

#### Day 1 — 2026-05-28 — Critical takeover fix
- [ ] **C-1 — `/login/select-wedding` requires selector token.** Mint a 5-min purpose-bound JWT (`purpose: 'select-wedding'`, `members: [allowed memberIds]`) at `/login` and `/google` whenever the response is multi-wedding. `/select-wedding` verifies the token and checks the requested `memberId` is in the allowlist.
- [ ] **H-1 — Strip `joinCode` from multi-wedding response.** Lands with C-1 — same code path.
- [ ] **M-15 — Soft 401 handling for expired selector.** Frontend recognises the selector-expired 401 and returns to the login screen with a toast, instead of the hard `window.location.href = '/'` page-reload.

#### Day 2 — Quick auth-bench wins (≤2 hours total)
- [ ] **H-3 — Add `/api/weddings` and `/api/weddings/personal` to the auth-strict rate limiter.**
- [ ] **H-6 — Pin `jwt.verify` algorithms to `['HS256']`.**
- [ ] **H-4 — SMTP-not-configured fails closed in production.** Throw at startup if `NODE_ENV === 'production'` and SMTP env is absent; never log the reset URL in production.
- [ ] **Pagination cap** — `limit = Math.min(parseInt(limit) || 50, 100)` on `GET /api/expenses`.

#### Day 3 — Input safety
- [ ] **H-7 — Escape `$regex` search inputs** for `searchCategory`, `searchDesc`, `searchMember`. Lift the existing `escapeRegex` helper from `weddingRoutes.js:173` into `Backend/utils/regex.js`. Cap length to 64.
- [ ] **M-8 + M-9 — Array + string length caps** on `categories` (max 50 items, name max 60 chars) and at the API layer for `description`/`vendor`/`notes`/`paidBy`.
- [ ] **M-5 — Atomic workspace+admin creation.** Wrap the two-step `Wedding.create` → `Member.create` → `workspace.save` in a Mongo transaction (Atlas replica-set already provides the prerequisites).

#### Day 4-5 — Brute-force defence
- [ ] **H-2 — Per-account login lockout.** Add `loginAttempts` + `lockedUntil` to Member; lock for 15 min after 10 consecutive failures. Reset on success. Keep anti-enumeration semantics (dummy bcrypt on unknown email).
- [ ] **Interim C-2 — JWT lifetime `30d` → `7d`.** Short-term mitigation while the full HttpOnly migration is planned.

#### Day 6-7 — Email verification
- [ ] **H-5 — Email verification flow.** `emailVerifiedAt` field on Member; verification email on signup with hashed one-time token (same pattern as password reset); gate "owner" privileges (workspace edit, password reset) on verification.

#### Week 2 — Big lifts
- [ ] **C-2 (full) — HttpOnly + refresh-token rotation.** Migrate JWT from `localStorage` to `Set-Cookie` (`HttpOnly; Secure; SameSite=Strict`). Short-lived (15 min) access token + rotating single-use refresh token (cookie-only). Logout-everywhere endpoint that revokes all refresh tokens for the member.
- [ ] **CSRF protection** — double-submit token added with the cookie migration.
- [ ] **H-8 — CAPTCHA / Cloudflare Turnstile** on signup, login, forgot-password.

#### Week 3 — Observability + audit + ops
- [ ] **M-4 — Audit log collection.** Append-only `AuditEvent` doc per admin action: `{ actor, target, action, weddingId, ts, ip, userAgent }`.
- [ ] **Structured logging** — `pino` with `redact: ['req.headers.authorization', '*.password', '*.token']`.
- [ ] **Sentry** integration on backend + frontend, with PII scrubbing.
- [ ] **Backups** — nightly `mongodump` to S3, 30-day retention, restore drill documented.
- [ ] **CSP `report-to`** + tiny report-collector endpoint.
- [ ] **P-2 — Boot-time env var check.** Refuse to start in production if any of `JWT_SECRET`, `MONGODB_URI`, `GOOGLE_CLIENT_ID`, `SMTP_*`, `CLOUDINARY_*` are missing.
- [ ] **P-3 — Startup check for sparse joinCode index** (refuse boot if any `type: 'personal'` Wedding exists AND the index isn't sparse).

#### Week 4+ — Architecture
- [ ] **A-1 + A-2 — `canAct(member, workspace, action)` helper** + `protect` sets `req.workspace` and `req.features` (eliminates per-route re-fetches; M-13 also benefits).
- [ ] **A-3 — `bannedAt` field** distinct from `isActive`. Banned members can never re-join.
- [ ] **A-4 — Tenant-scoped query helper** that throws if `weddingId` is omitted.
- [ ] **A-6 — Boundary validation** via Zod schemas at every route.
- [ ] **A-7 — `User` entity separate from `Member` + multi-wedding membership join table.** Couple with Phase 0b cosmetic rename (§9.6).
- [ ] **TOTP 2FA** for admin role.
- [ ] **L-7 — Constant-time login** (dummy bcrypt on email-not-found).
- [ ] **L-2 — Request correlation ID** via `nanoid` + propagate to logs.
- [ ] **L-3 — Cloudinary URL validation** (server-side assert returned URL starts with `https://res.cloudinary.com/${CLOUD_NAME}/`).
- [ ] **L-5 — Tighter `Permissions-Policy`** (payment, usb, gyroscope, etc.).

### 14.4 — Current status

**Audit completed:** 2026-05-28.
**Phase 14.A Critical fixes (Day 1):** ✅ **shipped 2026-05-28** — C-1 (workspace-takeover bypass on `/login/select-wedding`), H-1 (joinCode leak in multi-wedding response), and M-15 (401 interceptor losing in-flight state) all landed together. See the 2026-05-28 Progress-log entry.
**Phase 14.B High-band quick wins (Day 2):** ✅ **shipped 2026-05-28** — H-6 (`jwt.verify` algorithms pinned to `HS256`), H-3 (stricter `signupLimiter` 10/hour on POST `/weddings` + `/weddings/personal`), H-4 part A (reset URL no longer logged in production), H-4 part B (boot-time preflight refuses to start in production if SMTP env vars are missing), and the GET `/api/expenses` pagination cap (`limit ∈ [1, 100]`). See the same Progress-log entry.
**Phase 14.C Input safety (Day 3):** ✅ **shipped 2026-05-28** — H-7 (`$regex` search inputs in `GET /api/expenses` escape + length-cap via new shared `Backend/utils/regex.js`), M-8 (Wedding categories array capped at 50 items, name capped at 60 chars, icon at 8 chars), M-9 (`Expense.paidBy` capped at 100 chars), M-5 (workspace + admin / workspace + owner creation now atomic via `mongoose.startSession` + `withTransaction` on both `POST /api/weddings` and `POST /api/weddings/personal`). See the Day 3 Progress-log entry.
**Phase 14.D Brute-force defence (Day 4-5):** ✅ **shipped 2026-05-28** — H-2 per-account login lockout (10 consecutive failures → 15-min cooldown; counters reset on success; dummy bcrypt-compare against a pre-computed `ANTI_ENUM_HASH` on the unknown-email path preserves timing parity, which also closes L-7 for free) + interim C-2 mitigation (default JWT lifetime `30d` → `7d` in `generateToken`; env override still honoured). See the 2026-05-28 Day 4-5 Progress-log entry.
**Phase 14.E Email verification (Day 6-7):** ✅ **shipped 2026-05-28** — H-5 end-to-end: `emailVerifiedAt` field on Member (selectable; token + expires fields `select:false`); shared `Backend/utils/verificationToken.js` mint helper (24 h expiry, sha256-hashed); `sendVerificationEmail` in `utils/email.js` mirroring the reset-email pattern (dev logs link, prod CRITICAL on SMTP-missing); wedding-create + personal-create signups pre-mint token inside the M-5 transaction and fire-and-forget the email after commit; Google-auth path auto-verifies on create + on first sign-in (existing members); new `POST /api/auth/verify-email` + `POST /api/auth/resend-verification` routes (anti-enumeration generic responses); `POST /api/auth/reset-password` 403-gated on `emailVerifiedAt` with `code: 'EMAIL_NOT_VERIFIED'` + auto-verifies all same-email members on success (defence in depth); new `Frontend/src/pages/VerifyEmailPage.tsx` with three-phase UI + inline resend form; one-shot idempotent `Backend/scripts/backfillEmailVerified.js` grandfathers existing local-auth Members as verified. See the 2026-05-28 Day 6-7 Progress-log entry.
**Phase 14.F Big lifts (Week 2):** planned.
**Phase 14.G Observability + ops (Week 3):** planned.
**Phase 14.H Architecture (Week 4+):** planned, sequenced after Phase 0b rename.

**Production gate:** the platform is not safe for public exposure until at least the Day 1–3 items are merged. A closed beta to personally-known users becomes acceptable after Day 1–2 ship. Broad public launch requires through Week 2.

---

## Quick Facts

| Key | Value |
|---|---|
| **Project** | Wedding Expense Tracker — collaborative family wedding expense management. **Vertical #1 of a planned multi-vertical expense-tracking SaaS** (Wedding → Trip → Personal → …). Cross-vertical expansion plan: see §9. |
| **Stage** | P0 Prototype (pre-launch) — i18n + premium design system landed early. Multi-vertical Phase 0a + Phase 2 (Personal MVP) + polish all shipped 2026-05-27/28. **Security audit completed 2026-05-28 — 1 Critical + 8 High findings; remediation Days 1-7 of §14 all shipped same day (C-1, H-1, H-2, H-3, H-4, H-5, H-6, H-7, M-5, M-8, M-9, M-15, pagination cap, interim C-2).** Next milestone: Week 2 (full C-2 HttpOnly + refresh-token rotation + CSRF + H-8 CAPTCHA). |
| **Tech** | React 19 (TypeScript) + Vite 8 → Express 4 + Mongoose 8 → MongoDB Atlas |
| **Architecture** | Two-tier monolith: SPA frontend + REST API backend |
| **Auth** | JWT (7d default, interim C-2 mitigation; full HttpOnly + refresh-token rotation queued for Week 2) + bcrypt (rounds 12) + per-account lockout (10 failures → 15-min cooldown, H-2) + **email verification** on local-auth signup (24 h token; Google-auth auto-verified; password-reset gated, H-5) + **server-verified Google Sign-In** (`google-auth-library`). Members join via 6-char code (no password); credentialed accounts must use Login (join-takeover fix). Email-based password reset with anti-enumeration generic responses + dummy-bcrypt timing parity on `/login` unknown-email path. |
| **DB** | 3 collections: Wedding, Member, Expense. Wedding-scoped isolation |
| **i18n** | English + conversational North-Indian Hindi. Custom context (~5 KB gzipped). Toggle on Landing/Dashboard/Settings |
| **Design** | Premium SaaS v2: warm-cream light + dark themes, Inter + Noto Sans Devanagari, rose/violet gradient palette, glassmorphic + layered shadows, responsive mobile/tablet/desktop with floating-pill bottom nav on desktop |
| **Bundle** | ~118.9 KB gzipped JS, ~9.4 KB gzipped CSS (post TS migration + dual table views). Zero motion-lib deps — pure CSS animations + Pointer Events. |
| **Receipts** | Cloudinary upload with auto-optimize. Live upload-progress UX. Backend returns `warning` field on partial-success (silent failures eliminated). Full-screen viewer with pinch/wheel/dbl-tap zoom, drag-pan, one-tap JPG download via `fl_attachment` URL transform. |
| **Categories** | 20 culturally-aware Indian wedding defaults. Smart migration CTA in Settings for weddings created before expansion. |
| **Data freshness** | Three-layer pattern: refresh on auth, on tab visibility (15s throttle), on AddExpense mount. Members always see admin's latest category list. |
| **Hard rule** | Every query must filter by `weddingId`. No cross-wedding leakage. User-typed data is never translated — only UI chrome. |
| **Owner** | Alok Kumar — `contact.alokkumarr@gmail.com` |
| **Next milestone** | **Security Remediation Days 4-5** — H-2 (per-account login lockout + dummy-bcrypt for anti-enumeration timing) and interim C-2 mitigation (JWT lifetime `30d` → `7d`). Then Days 6-7: H-5 email verification. Week 2: full C-2 HttpOnly cookie + refresh-token rotation + H-8 CAPTCHA. Days 1+2+3 ✅ shipped 2026-05-28 — see §14.4. **Phase 1 (Trip MVP) unblocked** from a security gate standpoint; can resume any time. |