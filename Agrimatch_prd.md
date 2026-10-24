# AgriMatch — Product Requirements Document (PRD)

### MERN + React (Vite) — Farmer-Buyer Agri-Marketplace Platform

> **Version:** 1.0
> **Brand:** AgriMatch
> **Primary color:** `#13db0f`
> **Audience:** Founders, developers, AI coding assistants (Cursor, Copilot, Claude), designers
> **Purpose:** Single source of truth for pages, features, data models, API contracts, security, and copy-paste build prompts for the AgriMatch platform.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Brand & Design System](#2-brand--design-system)
3. [Tech Stack](#3-tech-stack)
4. [Information Architecture (Pages)](#4-information-architecture-pages)
5. [Core Feature Specifications](#5-core-feature-specifications)
6. [App Workflow & Navigation Map](#6-app-workflow--navigation-map)
7. [Data Models](#7-data-models)
8. [Repository Structure](#8-repository-structure)
9. [Environment Variables](#9-environment-variables)
10. [Backend Architecture](#10-backend-architecture)
11. [API Documentation](#11-api-documentation)
12. [Security Checklist](#12-security-checklist)
13. [Frontend Architecture (React + Vite)](#13-frontend-architecture-react--vite)
14. [Roadmap & Phasing](#14-roadmap--phasing)
15. [Master Build Prompt](#15-master-build-prompt)

---

## 1. Product Overview

**AgriMatch** is a two-sided marketplace that connects **farmers** with **buyers** using AI-assisted crop recommendations, profit prediction, and smart demand-based matching — removing guesswork from what to grow and who to sell to.

### Problem statement
- Farmers often plant crops without reliable data on expected yield, cost, or nearby demand, leading to unsold produce or poor margins.
- Buyers (traders, retailers, exporters) struggle to find reliable farmers who can meet their quantity, quality, and timeline requirements.

### Core value proposition
| User | Value |
|---|---|
| **Farmer** | Get an AI-recommended crop plan based on land, soil, and season; predict profit before planting; get matched to real buyer demand; list produce directly. |
| **Buyer** | Post exact requirements (crop, quantity, price, quality, date, location) and get matched to the best-fit farmers automatically. |

### Primary personas
- **Farmer (seller)** — owns/works land, wants to maximize yield and profit, may have low digital literacy → needs **voice input** and **local language support**.
- **Buyer** — trader/retailer/exporter/agri-business sourcing produce at scale, needs speed and reliability.

---

## 2. Brand & Design System

| Token | Value |
|---|---|
| Brand name | **AgriMatch** |
| Primary color | `#13db0f` (AgriMatch Green) |
| Primary hover/dark | `#0fb80c` *(derive ~15% darker for hover states)* |
| Primary light/tint | `#e6fbe6` *(backgrounds, badges, success states)* |
| Neutral text | `#111827` (dark), `#6b7280` (muted) |
| Surface | `#ffffff`, `#f9fafb` |
| Alert/Warning | `#f59e0b` |
| Error | `#ef4444` |
| Font | Inter / Geist (system-ui fallback) |
| Corner radius | `rounded-xl` (12px) default for cards, `rounded-full` for pills/badges |
| Icon style | Line icons (lucide-react) with green accent |

### Theme system (light / dark / customizable accent)

The app ships **light and dark mode plus a user-selectable accent color**, changeable from Settings (§5.13). This is not a static palette: components must never reference a raw hex value. They reference **semantic tokens**, so the entire app re-themes from one variable change.

**Layer 1 — semantic tokens** (names are fixed; only values change):

| Token | Purpose |
|---|---|
| `--primary` / `--primary-fg` | Accent color + readable text drawn on top of it |
| `--bg` / `--surface` / `--elevated` | Page background, card, raised surface |
| `--text` / `--text-muted` | Body text, secondary text |
| `--border` | Dividers, input outlines |
| `--success` / `--warning` / `--danger` | Status colors — **not** user-themable (semantic meaning must not drift) |
| `--radius` | Corner radius (`0.75rem` default) |

**Layer 2 — accent presets.** The user picks **one** accent from a curated preset list. The derived shades (`hover`, `tint`, `border`, dark-mode-safe variant) are **computed from that one value**, never hand-authored — so a user cannot assemble a broken palette.

| Preset | Value |
|---|---|
| **AgriMatch Green (default)** | `#13db0f` |
| Sky | `#0ea5e9` |
| Indigo | `#6366f1` |
| Violet | `#8b5cf6` |
| Rose | `#f43f5e` |
| Amber | `#f59e0b` |
| Teal | `#14b8a6` |
| Slate | `#64748b` |

Presets are compiled into the bundle; the user's choice is stored as `preferences.accentColor` (§7) and reapplied at runtime. Custom hex entry is deliberately out of scope for v1 — presets guarantee contrast compliance.

**Layer 3 — mode.** `light` | `dark` | `system`, stored as `preferences.themeMode`. Class-based (a `dark` class on `<html>`), **not** media-query-only, because a user must be able to override their OS setting.

Tailwind v4 is CSS-first — there is no `tailwind.config.js`:

```css
/* frontend/src/index.css */
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

@theme inline {
  --color-primary: var(--primary);
  --color-primary-fg: var(--primary-fg);
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-elevated: var(--elevated);
  --color-text: var(--text);
  --color-muted: var(--text-muted);
  --color-border-default: var(--border);
  --radius-xl: var(--radius);
}

/* Light (default). --primary / --primary-fg are overwritten at runtime from user prefs. */
:root {
  --primary: #13db0f;
  --primary-fg: #06210a;
  --bg: #ffffff;
  --surface: #f9fafb;
  --elevated: #ffffff;
  --text: #111827;
  --text-muted: #6b7280;
  --border: #e5e7eb;
  --radius: 0.75rem;
}

.dark {
  --bg: #0f1720;        /* never pure #000 — halation glare on OLED */
  --surface: #16202b;
  --elevated: #1d2937;
  --text: #f3f4f6;
  --text-muted: #9ca3af;
  --border: #2a3644;
}
```

**Non-negotiable rules:**
- Components use semantic utilities only (`bg-surface`, `text-muted`, `border-border-default`). **No `dark:` variants in component markup** — mode switching is purely a variable swap.
- `--primary` and `--primary-fg` are the only two variables Settings writes at runtime.
- `--primary-fg` is derived from the accent's contrast ratio, so text on the accent stays readable for every preset.
- Dark mode layers surfaces by **lightness step**, not by shadow — shadows are invisible on dark backgrounds.
- A blocking inline script in `index.html` applies the stored mode + accent **before** first paint (see §13) to prevent a flash of the wrong theme.

Buttons, active nav states, progress indicators, and the crop-recommendation "AI pick" badge use `--primary`. Hover/pressed states use the derived darker shade of the active accent — never a hardcoded green.

---

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| **Frontend framework** | React + Vite (SPA) | Client-rendered; public pages are prerendered at build time for SEO |
| **Routing** | React Router | Maps 1:1 to the route table in §4 |
| **UI language** | React + TypeScript | Strict mode on |
| **Styling** | Tailwind CSS v4 (CSS-first) | Semantic design tokens, light/dark + user accent (see §2) |
| **Theming** | CSS custom properties | Mode + accent persisted per user; applied pre-paint (§13) |
| **Offline / PWA** | `vite-plugin-pwa` (Workbox) + IndexedDB | Installable app, cached data, queued writes (§5.12) |
| **Charts** | Recharts (or Chart.js) | Mandi price trend, profit/projection charts |
| **Maps** | Leaflet + OpenStreetMap tiles | Listing/requirement map view — no API-key billing |
| **Backend** | Node.js + Express | REST API, versioned `/api/v1` |
| **Language (backend)** | TypeScript | Strict mode on |
| **Database** | MongoDB (Atlas) | Document model fits variable crop/listing attributes well |
| **ODM** | Mongoose | Schema validation + indexes |
| **Validation** | Zod | Shared validation shape on both client and server where possible |
| **Auth** | Email **or** Phone number + OTP/password (no Google/social login) | JWT access + refresh token pattern |
| **Real-time** | Socket.io | Messages (farmer ↔ buyer chat), match notifications |
| **Voice input** | Web Speech API (browser) + server-side speech-to-text fallback (e.g. Whisper API) | For low-literacy farmers |
| **Localization** | `react-i18next` | Local Indian languages (Hindi, Telugu, Tamil, etc. — configurable list) |
| **File/image upload** | Cloudinary or S3 (signed URLs) | Crop photos (incl. disease scans §5.11), profile/farm photos |
| **Vision / disease diagnosis** | Gemini Vision or equivalent | Photo → disease → treatment advisory (§5.11) |
| **Market data** | Agmarknet / eNAM mandi price feed | Falls back to cached data offline (§5.9) |
| **Weather** | OpenWeatherMap (or IMD-linked provider) | Forecast + farm advisories (§5.10) |
| **Notifications** | Web Push (VAPID) + SMS (for OTP and match alerts) | SMS provider: Twilio/MSG91 |
| **Job scheduling** | node-cron | Recompute recommendations, expire stale listings, refresh mandi prices |
| **Monitoring** | Sentry (`@sentry/node`, `@sentry/react`) | Error tracking both sides |
| **Deploy: Frontend** | Static host (Vercel / Netlify / S3+CloudFront) | Vite build output is static assets |
| **Deploy: Backend** | Render / Railway | |
| **Deploy: DB** | MongoDB Atlas | IP allowlist required |

> **Version Safety Rule:** Never hardcode dependency versions from this document. Before writing `package.json`, web-search each package for its latest stable release and any open security advisories, then confirm with `npm show <package> version`. Use `^` ranges unless there's a documented reason to pin.

### Token lifetime standard
- Access JWT: `15 minutes` — `Authorization: Bearer` header
- Refresh token: `7 days` — `HttpOnly; Secure; SameSite=Strict` cookie
- OTP (phone/email verification): `5 minutes`, 6-digit, rate-limited to 3 sends / 15 min per identifier

---

## 4. Information Architecture (Pages)

> **Revision note:** the original sitemap treated "Advanced Dashboard" as a single flat page, left Login/Sign-up and Terms out of the tree entirely, and put Marketplace only under the Buyer branch even though both roles use it. The structure below fixes that: one page hierarchy, each node meaning one thing, shared pages pulled into their own branch.

```
Pages
├── Home
│   ├── Header (nav: Logo, Home, About, Contact Us, Login / Sign up)
│   └── Hero (headline, sub-headline, primary CTA: "Get Started", secondary CTA: "How it works")
├── About                → Mission, how AgriMatch works, team/impact stats
├── Contact Us           → Contact form + support email/phone
├── Privacy Policy       → Data handling, storage, rights (GDPR-style export/delete)
├── Terms & Conditions   → Marketplace rules, dispute handling, delivery/payment liability
├── Login / Sign up      → Email or phone + OTP; first login opens the Role Picker
├── Role Picker (pop-up, first login only) → Farmer or Buyer
├── Farmer Dashboard (auth-gated, role: farmer)
│   ├── Crop Recommendation      ← step 1: decide what to grow
│   ├── Crop Profit Prediction   ← step 2: check the numbers on the chosen crop
│   ├── Crop Health Scan         ← photograph a leaf/plant for disease diagnosis (§5.11)
│   ├── My Listings
│   └── Matched Buyers
├── Buyer Dashboard (auth-gated, role: buyer)
│   ├── Post Requirement
│   └── Matched Farmers
└── Shared (auth-gated, both roles)
    ├── Marketplace   → browse all active listings & open requirements
    ├── Market Prices → mandi rates, trend, best nearby mandi (§5.9)
    ├── Weather       → forecast + irrigate/spray/sow advisories (§5.10)
    ├── Messages      → chat per match
    ├── Orders        → order history & status
    └── Settings      → profile, appearance (theme + accent), language, notifications
```

**Voice input and local-language support are not pages** — they're a cross-cutting overlay available on every form and chat screen above (see §5.7), not a destination a user navigates to.

The public header no longer links to a generic "Advanced Dashboard." It links to **Login / Sign up**, which routes an already-authenticated user straight to their role-specific dashboard.

### Route table (React Router)

| Route | Access | Description |
|---|---|---|
| `/` | Public | Home (Header + Hero) |
| `/about` | Public | About page |
| `/contact` | Public | Contact form |
| `/privacy-policy` | Public | Privacy policy |
| `/terms` | Public | Terms & Conditions (marketplace rules, disputes, liability) |
| `/login` | Public | Email/Phone + password or OTP login |
| `/signup` | Public | Registration, then role-selection pop-up |
| `/onboarding/role` | Auth (no role set) | Farmer vs Buyer selection pop-up |
| `/dashboard` | Auth | Redirects to `/dashboard/farmer` or `/dashboard/buyer` based on role |
| `/dashboard/farmer` | Auth (farmer) | Farmer home: stats, quick actions |
| `/dashboard/farmer/crop-recommendation` | Auth (farmer) | AI crop recommendation engine — step 1 |
| `/dashboard/farmer/crop-prediction` | Auth (farmer) | Crop profit prediction tool — step 2 |
| `/dashboard/farmer/crop-health` | Auth (farmer) | Crop disease scan from photo + history (§5.11) |
| `/dashboard/farmer/listings` | Auth (farmer) | Create/manage crop listings |
| `/dashboard/farmer/matches` | Auth (farmer) | AI-recommended buyers |
| `/dashboard/buyer` | Auth (buyer) | Buyer home: stats, quick actions |
| `/dashboard/buyer/post-requirement` | Auth (buyer) | Post a buying requirement |
| `/dashboard/buyer/matches` | Auth (buyer) | AI-matched farmers |
| `/marketplace` | **Public** | Browse all active listings — browsable before login (SEO + buyer lead-gen). Only chat/contact requires auth. |
| `/marketplace/map` | **Public** | Map view of nearby listings/requirements (§5.8) |
| `/market-prices` | Auth | Mandi prices, trend chart, best nearby mandi (§5.9) |
| `/weather` | Auth | Forecast + farm advisories (§5.10) |
| `/messages` | Auth | Chat threads (Socket.io) |
| `/messages/:threadId` | Auth | Single conversation |
| `/orders` | Auth | Order history & status |
| `/orders/:id` | Auth | Order detail |
| `/settings` | Auth | Profile, appearance (theme/accent), language, notifications |

---

## 5. Core Feature Specifications

### 5.1 Authentication (Email/Phone only)

- **No Google/social login** — only **email** or **phone number**, each with password **or** OTP flow.
- Registration: identifier (email or phone) → OTP verification → set password → role selection pop-up (Farmer / Buyer).
- Login: identifier + password, or identifier + OTP ("Login with OTP" toggle).
- One account = one primary role at a time (a user can request to add the other role later from Settings, but the dashboard, listings, and matching logic are always role-scoped).
- OTP delivery: SMS for phone, email link/code for email identifiers.
- Session bootstrap: refresh-token cookie → access token → `GET /users/me` → route to correct dashboard.

**Role-selection pop-up** (per Image 2): shown immediately after first login/signup.
- Farmer selected → routed to Farmer Dashboard, shown crop-recommendation interstitial and prior listing history (if any).
- Buyer selected → routed to Buyer Dashboard with AI-recommended farmer list.

### 5.2 Crop Recommendation Engine

> Runs **first** in the farmer journey — before a crop is chosen, not in parallel with prediction. A farmer with no crop planted yet has nothing to run profit numbers on; recommendation is what gets them to a crop name in the first place.

**Input fields (farm details):**
| Field | Type |
|---|---|
| Location | string / geo |
| Land size | number (acres/hectares) |
| Soil type | enum (e.g. Alluvial, Black, Red, Laterite, Sandy, Clay) |
| Season | enum (Kharif, Rabi, Zaid / or Spring, Summer, Monsoon, Winter) |

**Workflow:**
```
Farm Details (Land Size + Soil Type + Location + Season)
        ↓
Recommendation Engine
        ↓
Ranked Crop Recommendations
   - Suitability score per crop
   - Reasoning for each recommendation
   - Top 3 picks highlighted with:
       • demand rate (current buyer demand)
       • risk rate
       • nearby buyers list
        ↓
 "Run Profit Prediction on this crop" → §5.3
```

- Recommendations are ranked (not just listed) and each includes a short human-readable **reason** ("High soil suitability + strong nearby demand").
- Top 3 crops get an enhanced card showing **demand rate**, **risk rate**, and a **nearby buyers** shortcut straight into Smart Matching.
- Each recommended crop has a **"Run Profit Prediction"** action that pre-fills the crop name into the §5.3 form — the two tools are one guided flow, not two disconnected features.

### 5.3 Crop Profit Prediction

> Runs **second** — once a crop is chosen (from §5.2, or entered manually), the farmer checks the numbers before committing, and can re-run it again after harvest with actual yield/cost.

**Input fields:**
| Field | Type | Required |
|---|---|---|
| Crop name | string / autocomplete (pre-filled if coming from Crop Recommendation) | Yes |
| Location | string (or map picker) | Yes |
| Estimated yield | number (e.g. kg/acre) | Yes |
| Estimated cost | number (currency) | Yes |

**Behavior:**
1. Farmer submits the form.
2. Backend/AI service estimates expected revenue from crop type, location-based market price data, and yield.
3. Response shows: **Estimated Revenue**, **Estimated Profit** (revenue − cost), and a ranked list of **AI-recommended buyers** currently seeking that crop.
4. Result is saved to the farmer's prediction history (visible on the Advanced Dashboard).

**Output card:**
```json
{
  "cropName": "Tomato",
  "estimatedYieldKg": 4000,
  "estimatedCost": 25000,
  "estimatedRevenue": 68000,
  "estimatedProfit": 43000,
  "recommendedBuyers": [
    { "buyerId": "...", "name": "GreenLeaf Traders", "requiredQty": 3000, "offeredPrice": 18 }
  ]
}
```

### 5.4 Smart Buyer–Farmer Matching

**Farmer side:**
- After cultivation, farmer creates a **crop listing**: crop name, available quantity, expected price, quality grade, harvest date, location.
- Platform searches active buyer requirements and surfaces buyers whose stated needs match the listing.

**Buyer side:**
- Buyer posts a **requirement**: crop, quantity, maximum price, quality, required-by date, location.
- AgriMatch identifies farmers whose listings best satisfy those requirements.

**Matching algorithm (v1, rule-based; upgrade path to ML later):**
1. Hard filters: crop type match, location within buyer's radius, harvest/availability date ≤ required-by date.
2. Soft scoring: price fit (closer to buyer's max = higher score), quantity fit, quality grade match, farmer reliability score (from completed-deal history).
3. Return top-N ranked matches to both sides; either party can initiate a chat from a match card.

### 5.5 Advanced Dashboard

A shared shell with role-specific widgets, but both roles see a historical, data-driven view of **their own** activity:

**Farmer view:**
- What they've listed today / this season, total profit made, number of buyers connected, and — of the buyers they connected with — how many actually completed a purchase (funnel: *Listed → Connected → Deal Closed*).
- Example funnel widget: "Connected with 100 buyers → 50 agreed to a deal → 10 completed a purchase."

**Buyer view:**
- Their posted requirements, number of matched farmers, deals in progress, deal history.

**Privacy boundary (important):** a farmer never sees a buyer's actual dashboard or that buyer's other deals, and vice versa. What each side sees about a *matched counterparty* is a small, aggregated trust signal only — e.g. a buyer's typical order size and on-time-payment rate, or a farmer's typical yield accuracy and on-time-delivery rate — never the counterparty's private stats, other listings, or other conversations. If the earlier draft's "farmer can see the buyer's dashboard" language is taken literally, treat that as a bug, not a spec: build the aggregated view described here instead.

### 5.6 Marketplace, Messages, Orders

These three are **shared pages**, not role-exclusive — every earlier diagram that nested Marketplace only under the buyer's side undersold that farmers need it too (to see who's currently buying) as much as buyers need it (to see who's currently selling).

- **Marketplace** — browsable feed of all open listings/requirements (search + filters: crop, location, price range, quality).
- **Messages** — real-time chat (Socket.io) between a matched farmer and buyer, scoped to a listing/requirement thread.
- **Orders** — once a deal is agreed in chat, either party can convert it into a formal **Order** record (crop, quantity, agreed price, delivery date, status).

### 5.7 Voice Input & Local Languages (cross-cutting, not sequential)

Earlier drafts placed these at the *end* of the workflow, as if they were reached only after Marketplace → Messages → Orders. That's backwards for the stated audience (low-digital-literacy farmers): these need to be available on **every** screen from day one, not bolted on last.

- **Voice** — a voice-to-text `<VoiceField>` sits next to every text input across Crop Recommendation, Crop Profit Prediction, listing/requirement creation, and chat. Text typing always remains available as the default — voice is additive, never voice-only.
- **Local Languages** — full UI localization from the first release, not a later add-on; language switcher available at signup and in Settings, persisted per user, and respected by every page in §4.

### 5.8 Map & Geo-Tagged Discovery

Listings and requirements already carry `location: { address, lat, lng }` (§7) — surface it as a map instead of only a text list.

- `/marketplace/map` renders active listings/requirements as clustered markers (Leaflet + OSM tiles — no API key or billing).
- A radius filter ("within 25 / 50 / 100 km") drives both the map and the list, so the two views always agree.
- Marker click opens a compact card (crop, quantity, price, distance) with a shortcut into chat for matched records.
- A farmer with no coordinates is prompted to drop a pin once; the value is reused for every future listing.

### 5.9 Mandi Market Prices (Agmarknet)

Every competing Indian agri platform leads with this, and it is the strongest single reason a farmer opens the app. Without it AgriMatch can tell a farmer *what* to grow but not whether today's price is a good one.

- **Price board** — current min / modal / max price per quintal for the farmer's crops, from the nearest mandis (Agmarknet / eNAM).
- **Trend** — 7-day sparkline per crop with an up / down / stable indicator.
- **Best nearby mandi** — mandis ranked by net price *after* estimated transport distance, so the highest headline price isn't automatically recommended.
- **Feeds existing modules** — `crop-prediction` (§5.3) should use a live mandi price as its revenue input instead of a static assumption.
- **Freshness + attribution are mandatory** — every price card shows an "as of" timestamp and the data source. Never render a price without both.
- **Offline** — last-fetched prices are cached and shown with a stale badge (§5.12).

### 5.10 Weather & Farm Advisories

- **Current + 7-day forecast** for the farm's coordinates (§7 `FarmProfile.location`).
- **Actionable advisories, not raw numbers** — "irrigate in the next 2 days", "avoid spraying today (wind)", "good sowing window", "harvest before Thursday's rain".
- **Severe-weather alerts** — frost, heatwave, heavy rain and hailstorm warnings pushed as notifications. These are the events where a timely warning actually saves a crop.
- **Feeds crop-recommendation** (§5.2) — season and weather context sharpen the recommendation reasoning text.
- **Offline** — forecast cached for 24h with an "as of" timestamp (§5.12).

### 5.11 Crop Disease Diagnosis (Photo)

The highest-engagement feature across every competitor analysed. A farmer photographs a symptomatic leaf and gets an answer in seconds instead of waiting days for an extension officer.

```
Camera capture / gallery pick
        ↓
Client-side downscale  (keeps the upload small on rural bandwidth)
        ↓
POST /api/v1/crop-health/diagnose  →  vision model (Gemini Vision or equivalent)
        ↓
{ disease, confidence, severity, treatmentSteps[], preventionTips[] }
        ↓
Saved to the farmer's scan history  →  optional "list this crop" action
```

- **Low-confidence handling is mandatory.** Below a confidence threshold the UI must say "not sure — here are the two most likely causes" and surface a helpline contact. Never present a confident-sounding wrong diagnosis: a wrong pesticide recommendation costs a real harvest.
- **Client-side image downscaling before upload** — rural bandwidth is the binding constraint.
- **Read the treatment steps aloud** (same pattern as §5.7 `<VoiceField>`), since the target user may not read fluently.
- **History per crop** — so a farmer can see whether a treatment actually worked.
- Scans are sensitive farm data: never expose image URLs publicly, and honour the account-deletion flow (§12).

### 5.12 Offline-First Behaviour (PWA)

Rural connectivity is intermittent, so offline support is a stated product requirement rather than a nice-to-have. The app is an installable PWA.

| Capability | Behaviour |
|---|---|
| **App shell** | Cached by a Workbox service worker after first visit — the app opens with no network |
| **Read cache** | Last-viewed marketplace results, mandi prices, weather, own listings/requirements and match list stay readable offline, each stamped with an "as of" time |
| **Queued writes** | Creating a listing, requirement, or disease scan while offline is queued in IndexedDB and synced automatically on reconnect |
| **Conflict rule** | Queued writes replay in order. A server rejection surfaces as a visible "couldn't sync" item the user can retry or discard — never a silent drop |
| **Connection indicator** | A persistent, calm offline banner. Network-only actions are visibly disabled rather than failing after a tap |
| **Install prompt** | Offered once, after a successful action — never on first paint |
| **Chat** | Last N messages cached read-only offline; sending is queued |

Caching is **stale-while-revalidate** for prices / weather / marketplace and **network-only** for auth. The service worker must never cache `Authorization` headers or auth responses.

### 5.13 Appearance & Theme (Settings)

The user-facing half of the token system in §2.

- **Mode** — Light / Dark / System as a segmented control. `system` follows `prefers-color-scheme` and keeps following it until the user chooses explicitly.
- **Accent** — a swatch row of the eight presets in §2, AgriMatch Green by default. Selecting a swatch updates `--primary` (and the derived `--primary-fg`) instantly, with a live preview card so the choice is visible before it is committed.
- **Reset to default** — one action returns mode to `system` and accent to AgriMatch Green.
- **Applied instantly, saved on change** — no separate "Save" button. The preference is optimistic and reconciled with `PATCH /api/v1/users/me/preferences` (§11).
- **Pre-paint application** — a blocking inline script applies the stored mode + accent before first render, so there is no flash of the wrong theme (§13).
- **Accessibility companion** — a large-text / high-contrast toggle lives in the same panel. This is not decoration: the primary farmer persona is explicitly low-digital-literacy (§1).
- Status colors are deliberately **not** customizable here (§2).

### 5.14 Trust Signals & Land-Unit Helper

Two cheap, high-visibility wins — the backend already supports both.

**Reliability score.** The matching engine already computes a farmer reliability score, defaulting to a neutral 70 with no history. Surface it:
- A compact badge on marketplace and match cards (e.g. "Reliability 82").
- On a matched counterparty, show only the **aggregated** signal defined in §5.5 — never their other listings, deals, or conversations.
- No history ⇒ show "New" rather than the raw default, so an unproven farmer isn't visually penalized.

**Land-unit converter.** The farm profile already accepts `acre | hectare | bigha | guntha` (§7). Farmers think in bigha; buyers quote per acre. Provide a small inline converter beside every area/quantity/price field so a listing entered in bigha displays a converted value to the counterparty — with the unit always stated explicitly, never implied.

---

## 6. App Workflow & Navigation Map

> **Revision note:** the original diagram drew Voice and Local Languages as the *last* two steps in a single linear chain — implying a farmer only reaches them after Marketplace → Messages → Orders. That contradicts §5.7: they need to be available everywhere from the start. The map below keeps the real navigation flow (top to bottom) but draws Voice/Local Language as a horizontal overlay across it, not a final destination.

```
                                   AGRIMATCH
                                       │
                       ┌───────────────┴───────────────┐
                FARMER DASHBOARD                 BUYER DASHBOARD
                       │                                │
         ┌─────────────┼─────────────┐                  │
  Crop Recommendation  │      Crop Profit Prediction     │
         └──────────────────┬────────┘                  │
                    My Listings                   Post Requirement
                             │                            │
                             └─────────────┬──────────────┘
                              Matched Buyers / Matched Farmers
                                            │
                         ┌──────────────────┼──────────────────┐
                   MARKETPLACE          MESSAGES             ORDERS
                                (shared pages, both roles)

  ════════════════════════════════════════════════════════════════
   Always-on overlay across every screen above, not a final step:
     • Voice input  — speak instead of type, on any form or chat
     • Local language switcher — available from signup onward
  ════════════════════════════════════════════════════════════════
```

**End-to-end user journey (Farmer):**
1. Sign up (email/phone) → verify OTP → select role: Farmer.
2. Enter farm details → get crop recommendations → (optional) run profit prediction on chosen crop.
3. After harvest, create a crop listing.
4. AgriMatch surfaces matched buyers → chat → agree terms → create Order.
5. Track order status; dashboard updates profit/connection stats.

**End-to-end user journey (Buyer):**
1. Sign up (email/phone) → verify OTP → select role: Buyer.
2. Post a requirement (crop, qty, price, quality, date, location).
3. AgriMatch surfaces matched farmers → chat → agree terms → create Order.
4. Track order status; dashboard updates sourcing stats.

---

## 7. Data Models

### User
```typescript
{
  _id: ObjectId,
  identifierType: 'email' | 'phone',
  email?: string,          // unique, sparse
  phone?: string,          // unique, sparse, E.164 format
  passwordHash: string,
  role: 'farmer' | 'buyer',
  name: string,
  location: { address: string, lat: number, lng: number },
  preferredLanguage: string,   // e.g. 'hi', 'te', 'ta', 'en'
  preferences: {               // user-facing app settings (§5.13)
    themeMode: 'light' | 'dark' | 'system',   // default 'system'
    accentColor: string,       // one of the accent presets in §2, default '#13db0f'
    largeText: boolean         // accessibility toggle, default false
  },
  isVerified: boolean,
  reliabilityScore: number,    // computed from completed orders
  createdAt: Date,
  updatedAt: Date,
  isDeleted: boolean
}
```

### FarmProfile (farmer-only)
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  landSizeAcres: number,
  soilType: 'alluvial' | 'black' | 'red' | 'laterite' | 'sandy' | 'clay',
  location: { address: string, lat: number, lng: number },
}
```

### CropPrediction
```typescript
{
  _id: ObjectId,
  userId: ObjectId,          // farmer
  cropName: string,
  location: string,
  estimatedYieldKg: number,
  estimatedCost: number,
  estimatedRevenue: number,   // computed
  estimatedProfit: number,    // computed
  recommendedBuyerIds: [ObjectId],
  createdAt: Date
}
```

### CropRecommendation
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  landSizeAcres: number,
  soilType: string,
  season: 'kharif' | 'rabi' | 'zaid',
  location: string,
  results: [
    {
      cropName: string,
      suitabilityScore: number,   // 0–100
      demandRate: number,
      riskRate: number,
      reason: string
    }
  ],
  createdAt: Date
}
```

### CropListing (farmer's supply)
```typescript
{
  _id: ObjectId,
  farmerId: ObjectId,
  cropName: string,
  quantityKg: number,
  expectedPricePerKg: number,
  qualityGrade: 'A' | 'B' | 'C',
  harvestDate: Date,
  location: { address: string, lat: number, lng: number },
  status: 'active' | 'matched' | 'sold' | 'expired',
  isDeleted: boolean,
  createdAt: Date
}
```

### BuyerRequirement (buyer's demand)
```typescript
{
  _id: ObjectId,
  buyerId: ObjectId,
  cropName: string,
  quantityKg: number,
  maxPricePerKg: number,
  qualityGrade: 'A' | 'B' | 'C',
  requiredByDate: Date,
  location: { address: string, lat: number, lng: number },
  status: 'open' | 'matched' | 'fulfilled' | 'expired',
  isDeleted: boolean,
  createdAt: Date
}
```

### Match
```typescript
{
  _id: ObjectId,
  listingId: ObjectId,
  requirementId: ObjectId,
  farmerId: ObjectId,
  buyerId: ObjectId,
  score: number,               // matching algorithm output
  status: 'suggested' | 'contacted' | 'agreed' | 'rejected',
  createdAt: Date
}
```

### Order
```typescript
{
  _id: ObjectId,
  matchId: ObjectId,
  farmerId: ObjectId,
  buyerId: ObjectId,
  cropName: string,
  quantityKg: number,
  agreedPricePerKg: number,
  deliveryDate: Date,
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled',
  createdAt: Date,
  updatedAt: Date
}
```

### Message / Thread
```typescript
// Thread
{ _id: ObjectId, participantIds: [ObjectId], matchId: ObjectId, lastMessageAt: Date }

// Message
{
  _id: ObjectId,
  threadId: ObjectId,
  senderId: ObjectId,
  content: string,
  contentType: 'text' | 'voice',
  audioUrl?: string,
  createdAt: Date
}
```

### MandiPrice (cached market data, §5.9)
```typescript
{
  _id: ObjectId,
  commodity: string,          // crop name, normalized
  mandiName: string,
  district: string,
  state: string,
  minPricePerQuintal: number,
  modalPricePerQuintal: number,   // the price most commonly traded at
  maxPricePerQuintal: number,
  priceDate: Date,            // trading date of the quote
  source: string,             // e.g. 'agmarknet'
  fetchedAt: Date             // when this server cached it — drives the staleness badge
}
```
> `priceDate` and `fetchedAt` are both required. The UI must show which one it means when it stamps a card; a cached price is never presented as live (§5.9).

### CropHealthScan (§5.11)
```typescript
{
  _id: ObjectId,
  farmerId: ObjectId,
  cropName?: string,
  imageUrl: string,
  imageProviderId?: string,   // cloudinary public id, for deletion
  disease: string,
  confidence: number,         // 0–1; below threshold the UI shows alternatives, not a verdict
  severity: 'low' | 'moderate' | 'severe' | 'unknown',
  treatmentSteps: [string],
  preventionTips: [string],
  resolvedAt?: Date,          // farmer marks it resolved, closing the loop
  createdAt: Date
}
```

### WeatherSnapshot (cached, §5.10)
```typescript
{
  _id: ObjectId,
  district: string,
  state: string,
  current: { tempC: number, humidity: number, windKph: number, condition: string },
  forecast: [ { date: Date, tempMinC: number, tempMaxC: number, rainMm: number, condition: string } ],
  advisories: [string],       // generated "irrigate / don't spray / harvest before X" strings
  source: string,
  fetchedAt: Date
}
```

---

## 8. Repository Structure

```
AgriMatch/
├── backend/
│   ├── src/
│   │   ├── server.ts
│   │   ├── app.ts
│   │   ├── config/
│   │   │   ├── env.ts                 # Zod-validated env
│   │   │   └── db.ts
│   │   ├── middleware/
│   │   │   ├── requireAuth.ts
│   │   │   ├── validate.ts
│   │   │   ├── roleGuard.ts           # farmer-only / buyer-only routes
│   │   │   └── errorHandler.ts
│   │   ├── modules/
│   │   │   ├── auth/                  # email/phone + OTP
│   │   │   ├── users/                 # profile + preferences (§5.13)
│   │   │   ├── farm-profile/
│   │   │   ├── crop-prediction/
│   │   │   ├── crop-recommendation/
│   │   │   ├── crop-health/           # disease diagnosis from photo (§5.11)
│   │   │   ├── market-prices/         # mandi rates, cached (§5.9)
│   │   │   ├── weather/               # forecast + advisories, cached (§5.10)
│   │   │   ├── listings/
│   │   │   ├── requirements/
│   │   │   ├── matching/
│   │   │   ├── orders/
│   │   │   └── messages/
│   │   ├── services/
│   │   │   ├── otp.service.ts         # SMS/email OTP
│   │   │   ├── ai.service.ts          # profit prediction + recommendation logic
│   │   │   ├── vision.service.ts      # crop disease diagnosis (§5.11)
│   │   │   ├── marketData.service.ts  # Agmarknet ingestion + caching (§5.9)
│   │   │   ├── weather.service.ts     # forecast fetch + advisory generation (§5.10)
│   │   │   └── matching.service.ts    # scoring algorithm
│   │   ├── sockets/
│   │   │   └── index.ts               # chat, JWT-guarded
│   │   └── utils/
│   │       ├── jwt.ts
│   │       └── ownershipCheck.ts
│   ├── .env.example
│   └── package.json
│
├── frontend/                          # React + Vite (SPA)
│   ├── index.html                     # inline pre-paint theme script lives here (§13)
│   ├── vite.config.ts                 # includes vite-plugin-pwa
│   ├── public/
│   │   ├── manifest.webmanifest        # PWA install metadata (§5.12)
│   │   └── icons/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                    # router tree
│   │   ├── index.css                  # Tailwind v4 @theme + token layers (§2)
│   │   ├── pages/                     # one file per route in §4
│   │   │   ├── Home.tsx  About.tsx  Contact.tsx  Privacy.tsx  Terms.tsx
│   │   │   ├── Login.tsx  Signup.tsx  RolePicker.tsx
│   │   │   ├── farmer/…               # recommendation, prediction, crop-health, listings, matches
│   │   │   ├── buyer/…                # post-requirement, matches
│   │   │   ├── Marketplace.tsx  MarketplaceMap.tsx
│   │   │   ├── MarketPrices.tsx  Weather.tsx
│   │   │   ├── Messages.tsx  Orders.tsx  Settings.tsx
│   │   ├── components/
│   │   │   ├── layout/Header.tsx  layout/Hero.tsx
│   │   │   ├── ui/…                   # Button, Card, Badge, Toast — semantic tokens only
│   │   │   ├── VoiceField.tsx         # §5.7
│   │   │   ├── ThemeSwitcher.tsx      # §5.13
│   │   │   └── OfflineBanner.tsx      # §5.12
│   │   ├── features/
│   │   │   ├── auth/  crop-prediction/  crop-recommendation/  crop-health/
│   │   │   ├── listings/  matching/  market-prices/  weather/
│   │   ├── theme/
│   │   │   ├── ThemeProvider.tsx      # context: mode + accent, applies vars
│   │   │   ├── accents.ts             # the preset table from §2
│   │   │   └── applyTheme.ts          # shared by provider AND the pre-paint script
│   │   ├── offline/
│   │   │   ├── queryCache.ts          # IndexedDB persistence
│   │   │   └── writeQueue.ts          # queued mutations + sync (§5.12)
│   │   ├── lib/
│   │   │   ├── api/client.ts          # Axios, withCredentials, refresh interceptor
│   │   │   ├── api/refreshClient.ts
│   │   │   └── i18n/
│   │   └── auth/tokenStore.ts         # in-memory access token only
│   └── package.json
│
├── docs/
│   └── AgriMatch_PRD.md               # this file
```

> Note: no `tailwind.config.js` — Tailwind v4 is configured in `src/index.css` via `@theme` (§2).

---

## 9. Environment Variables

### Backend `.env.example`
```env
NODE_ENV=development
PORT=5000

MONGODB_URI=mongodb://localhost:27017/agrimatch

JWT_ACCESS_SECRET=replace_with_64_char_hex
JWT_REFRESH_SECRET=replace_with_different_64_char_hex
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

CLIENT_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000

# OTP delivery
SMS_PROVIDER_API_KEY=your_sms_provider_key
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=your_smtp_api_key
EMAIL_FROM=noreply@agrimatch.app

# Voice (optional server-side STT)
SPEECH_TO_TEXT_API_KEY=your_stt_key

# Crop disease diagnosis (§5.11)
VISION_API_KEY=your_vision_api_key

# Mandi market prices (§5.9)
AGMARKNET_API_KEY=your_agmarknet_key

# Weather (§5.10)
WEATHER_API_KEY=your_weather_api_key

# Web Push (§5.12 severe-weather + match alerts)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key

SENTRY_DSN=https://your_sentry_dsn_here
```

### Frontend `.env.example`
```env
VITE_API_BASE_URL=http://localhost:5000
VITE_DEFAULT_LOCALE=en
VITE_SUPPORTED_LOCALES=en,hi,te,ta
VITE_SENTRY_DSN=https://your_sentry_dsn_here
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key
```

> There is deliberately **no** `BRAND_COLOR` env var. The accent is a runtime user preference (§5.13), not a build-time constant — changing it no longer requires a rebuild.

> `VITE_*` variables are inlined into the client bundle at build time. **Never** put a secret in one.

---

## 10. Backend Architecture

### Middleware order (`app.ts`)
```
1.  helmet()
2.  cors({ origin: CORS_ORIGINS.split(','), credentials: true })
3.  express.json({ limit: '10kb' })
4.  express.urlencoded({ extended: true })
5.  cookieParser()
6.  Inline NoSQL-operator sanitizer (strips `$`/`.` keys from body, query, params)
7.  morgan('dev') — development only
8.  Global rate limit — 100 req/min on /api
9.  Auth rate limit — 30 req/min on /api/v1/auth (incl. OTP send)
10. Routes (/api/v1)
11. 404 catch-all
12. Central error handler
```

> **Why not `express-mongo-sanitize`:** Express 5 exposes `req.query` and `req.params` as prototype getters, so the library's plain reassignment throws. `app.ts` uses a small inline sanitizer that `Object.defineProperty`-shadows the getters only when a key was actually stripped. Do not re-add the package.

### Standard response shape (shared with all endpoints)
```json
// Success
{ "success": true, "data": { } }

// Error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": {} } }
```

### Role guard example
```typescript
// middleware/roleGuard.ts
export const requireRole = (role: 'farmer' | 'buyer') => (req, res, next) => {
  if (req.user.role !== role) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: `Only ${role}s can access this resource` }
    });
  }
  next();
};
```

---

## 11. API Documentation

> The authoritative, field-level route reference is [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md). This section is the PRD-level summary: what the frontend depends on, plus the endpoints the §5 features require.

**Mount points as currently implemented (`app.ts`):**

| Prefix | Module | Status |
|---|---|---|
| `/api/v1/auth` | Authentication, OTP, role selection, session | Live |
| `/api/v1/farm-profiles` | Farmer farm profile | Live |
| `/api/v1/crop-listings` | Farmer supply listings | Live |
| `/api/v1/buyer-requirements` | Buyer demand | Live |
| `/api/v1/matches` | Matching engine | Live |
| `/api/v1/marketplace` | Unified search across listings + requirements | Live |
| `/api/v1/crop-predictions` | Profit prediction | Live |
| `/api/v1/crop-recommendations` | Crop recommendation | Live |
| `/api/v1/notifications` | Persisted notifications | Live |
| `/api/v1/users/me/preferences` | Theme + accessibility preferences (§5.13) | **New — to build** |
| `/api/v1/crop-health` | Disease diagnosis from photo (§5.11) | **New — to build** |
| `/api/v1/market-prices` | Mandi prices (§5.9) | **New — to build** |
| `/api/v1/weather` | Forecast + advisories (§5.10) | **New — to build** |
| `/api/v1/orders`, `/api/v1/messages` | Orders + chat | **Not yet built** (§5.6) |

### `POST /api/v1/auth/register`
**Description:** Register with email or phone; sends OTP.
**Auth required:** No
Body:
```json
{ "identifierType": "phone", "identifier": "+91XXXXXXXXXX", "password": "..." }
```
Response 201:
```json
{ "success": true, "data": { "message": "OTP sent" } }
```

### `POST /api/v1/auth/verify-otp`
Body: `{ "identifier": "...", "otp": "123456" }`
Response 200: `{ "success": true, "data": { "accessToken": "...", "user": { "role": null } } }`

### `POST /api/v1/auth/select-role`
**Auth required:** Yes (post-verification, role not yet set)
Body: `{ "role": "farmer" }`

### `GET /api/v1/auth/me`
**Auth required:** Yes
Returns the current user. The response is the client's source of truth for `preferences` (§5.13) — the theme is applied from this on login, so a returning user on a new device gets their accent immediately.

### `PATCH /api/v1/users/me/preferences` *(new, §5.13)*
**Auth required:** Yes
Body (all fields optional — partial update):
```json
{ "themeMode": "dark", "accentColor": "#6366f1", "largeText": false }
```
- `themeMode`: `light` | `dark` | `system`
- `accentColor`: must be one of the presets in §2 — reject unknown values with `400 VALIDATION_ERROR` rather than storing an arbitrary hex.

Response 200: `{ "success": true, "data": { "preferences": { ... } } }`

> The client applies the theme **optimistically and locally first**, then reconciles with this call. A failed save must not revert the visible theme — it shows a quiet "couldn't save" toast and retries.

### `POST /api/v1/crop-health/diagnose` *(new, §5.11)*
**Auth required:** Yes · **Role:** farmer
Multipart: `image` (≤ ~5 MB, jpeg/png/webp), optional `cropName`.
Response 200:
```json
{
  "success": true,
  "data": {
    "scanId": "...",
    "disease": "Early blight",
    "confidence": 0.87,
    "severity": "moderate",
    "treatmentSteps": ["..."],
    "preventionTips": ["..."],
    "alternatives": [{ "disease": "Late blight", "confidence": 0.09 }]
  }
}
```
- Server re-validates file type and size — never trust the client (§12).
- When `confidence` is below the threshold, `disease` is returned as `"uncertain"` and `alternatives` carries the ranked candidates. The client must render the "not sure" state (§5.11).

### `GET /api/v1/crop-health/scans` · `GET /api/v1/crop-health/scans/:id`
**Auth required:** Yes · **Role:** farmer — scan history, ownership-checked (404 for another user's scan).

### `GET /api/v1/market-prices` *(new, §5.9)*
**Auth required:** Yes
Query: `?commodity=tomato&district=Nashik&state=Maharashtra&days=7`
Response 200:
```json
{
  "success": true,
  "data": {
    "commodity": "Tomato",
    "unit": "quintal",
    "source": "agmarknet",
    "fetchedAt": "2026-10-21T09:10:00Z",
    "mandis": [
      { "mandiName": "Nashik APMC", "district": "Nashik", "state": "Maharashtra",
        "minPrice": 1200, "modalPrice": 1450, "maxPrice": 1700, "priceDate": "2026-10-20" }
    ],
    "trend": [ { "date": "2026-10-15", "modalPrice": 1380 } ]
  }
}
```
- Prices are INR per **quintal**, exactly as Agmarknet publishes them — no unit conversion.
- Always returns `source`, `fetchedAt`, `cached` (and per-mandi `priceDate`) — the UI cannot render a price without them (§5.9).
- **No `distanceKm`.** Agmarknet supplies no coordinates for a mandi, so the backend will not fabricate a distance. Distance sorting is a client-side concern for a later version.
- Served from cache; a scheduled job refreshes the cache rather than each request hitting the upstream feed.

### `GET /api/v1/weather` *(new, §5.10)*
**Auth required:** Yes
Query: `?district=Nashik&state=Maharashtra`
Response 200: `{ "success": true, "data": { "current": {...}, "forecast": [...], "advisories": [...], "source": "...", "fetchedAt": "..." } }`

### `POST /api/v1/crop-predictions`
**Auth required:** Yes · **Role:** farmer
Body: `{ "cropName": "Tomato", "location": "Nashik", "estimatedYieldKg": 4000, "estimatedCost": 25000 }`
Response 201: `{ "success": true, "data": { "estimatedRevenue": 68000, "estimatedProfit": 43000, "recommendedBuyers": [...] } }`
> Should source its revenue estimate from `/market-prices` (§5.9) rather than a static assumption.

### `POST /api/v1/crop-recommendations`
**Auth required:** Yes · **Role:** farmer
Body: `{ "landSizeAcres": 5, "soilType": "black", "season": "kharif", "location": "Nashik" }`
Response 200: `{ "success": true, "data": { "results": [ { "cropName": "Soybean", "suitabilityScore": 92, "demandRate": 78, "riskRate": 20, "reason": "High soil suitability + strong nearby demand" } ] } }`

### `POST /api/v1/crop-listings`
**Auth required:** Yes · **Role:** farmer
Body: `{ "cropName": "Tomato", "quantityKg": 3000, "expectedPricePerKg": 18, "qualityGrade": "A", "harvestDate": "2026-11-01", "location": {...} }`

### `POST /api/v1/buyer-requirements`
**Auth required:** Yes · **Role:** buyer
Body: `{ "cropName": "Tomato", "quantityKg": 3000, "maxPricePerKg": 20, "qualityGrade": "A", "requiredByDate": "2026-11-15", "location": {...} }`

### `GET /api/v1/matches`
**Auth required:** Yes
Returns ranked matches for the authenticated user's role (crop-listings ↔ buyer-requirements). Match cards surface the reliability badge from §5.14.

### `GET /api/v1/health` / `GET /api/v1/ready`
Liveness / readiness, no auth, excluded from rate limits.
> `/health` returns `200` whenever the process is alive. `/ready` returns `503` if the database is unavailable — the frontend's offline banner (§5.12) should key off `/ready`, not `/health`.

---

## 12. Security Checklist

- Passwords hashed with bcrypt (cost ≥ 10); refresh tokens hashed before storage.
- OTPs are single-use, expire in 5 minutes, rate-limited per identifier (3/15min) to prevent SMS/email bombing.
- Access token in `Authorization` header only; refresh token in `HttpOnly; Secure; SameSite=Strict` cookie.
- `assertOwnership()` on every listing/requirement/order/message controller — always 404, never 403, for another user's resource.
- All list endpoints (`/marketplace`, `/matches`) paginated; never return unbounded arrays.
- Inline NoSQL-operator sanitizer (see §10 — `express-mongo-sanitize` is **not** usable with Express 5), `helmet`, explicit CORS allowlist, `express-rate-limit` on all routes, strict on `/auth`.
- Voice/audio uploads: validate file type & size both client- and server-side before storage.
- Disease-scan images (§5.11): validate MIME type and size server-side, store under unguessable keys, and never expose a raw public URL. The stored `imageProviderId` must be used by the account-deletion flow so scans are actually removed, not orphaned.
- `PATCH /users/me/preferences` accepts only the whitelisted enum values from §2 — an arbitrary value must not reach the database.
- The service worker (§5.12) must never cache `Authorization` headers, auth responses, or any request to `/api/v1/auth`.
- Phone numbers/emails stored — treat as PII; never log OTPs, tokens, or full phone numbers in plaintext logs.
- `GET /users/me/export` and account-deletion flow for data-portability compliance.
- Socket.io connections authenticated with JWT before joining any chat room.

---

## 13. Frontend Architecture (React + Vite)

**Build & delivery.** Vite SPA; route-level code splitting via `React.lazy`. Chart (Recharts) and map (Leaflet) libraries are **lazily loaded** — they are heavy and most sessions never open those pages.

**SEO without SSR.** An SPA can't server-render, so the public marketing routes (`/`, `/about`, `/contact`, `/privacy-policy`, `/terms`) are **prerendered to static HTML at build time** (`vite-react-ssg` or `react-snap`). Authenticated routes stay client-only and are marked `noindex` — they must never be prerendered, since their content is user-specific. If dynamic per-page meta tags are needed, render them with a `useDocumentMeta` hook on route change.

**Routing & guards.** React Router mirrors the §4 route table. `RequireAuth` (redirects to `/login` preserving the intended path) and `RequireRole` (redirects mismatched roles to their own dashboard, never a 403 page) wrap the authenticated tree.

**API client.** Axios with `withCredentials: true` and a single-flight refresh interceptor on 401 — concurrent 401s share one refresh promise rather than firing N refresh calls. The access token lives **in memory only** (`auth/tokenStore.ts`), never `localStorage`. The refresh token is an HttpOnly cookie the JS never reads. This is the one place the "never localStorage" rule applies — see the theming note below for why theme preference is exempt.

**Server state.** TanStack Query for all server data, invalidated on mutation. Persisted to IndexedDB via the query persistence plugin, which is also what backs the offline read cache in §5.12.

**Forms.** React Hook Form + Zod for every form (registration, OTP, crop prediction, crop recommendation, listing/requirement creation, disease scan metadata). Validation schemas are shared with the backend where possible.

**i18n.** `react-i18next` wraps the whole app; every user-facing string is a translation key from day one, never retrofitted. Include Indic-script font support and locale-correct number/date/currency formatting — not just translated strings.

**Voice.** `<VoiceField>` wraps any text input using the Web Speech API, with a manual-typing fallback always visible. Voice is additive, never voice-only (§5.7).

**Socket.io.** A single `SocketProvider` connects once per session and is consumed by `/messages` and live match/order notifications.

### Theming implementation (§2 / §5.13)

- `theme/accents.ts` holds the preset table. `theme/applyTheme.ts` is a **pure function** that takes `{ mode, accent }` and writes the `dark` class plus the `--primary` / `--primary-fg` custom properties onto `document.documentElement`.
- `ThemeProvider` owns the React state, calls `applyTheme` on change, persists to `localStorage` for instant signal, and reconciles with `PATCH /users/me/preferences`.
- **Pre-paint script.** A small blocking script in `index.html` reads the `localStorage` values and applies mode + accent **before** the bundle loads, preventing a flash of the wrong theme. It must implement the same logic as `applyTheme.ts` — keep the two in sync deliberately, and keep the inlined script minimal so it cannot become a render bottleneck.
- **Why `localStorage` is allowed here:** the rule against `localStorage` protects *auth tokens*, which must not be readable by injected script. A theme preference is not a credential, and it must be available synchronously before first paint — which is exactly what `localStorage` is for. It is never used to store a token.
- On login, `GET /auth/me` returns `preferences`; the server value wins over any stale local value, so a user signing in on a new device immediately sees their own theme.
- `system` mode listens to `prefers-color-scheme` changes and re-applies while selected.

**Palette safety.** `--primary-fg` is computed from the accent's contrast ratio rather than hardcoded per preset, so adding a preset later can't silently produce unreadable button text. Any new preset must be contrast-checked before it ships.

### Offline implementation (§5.12)

- `vite-plugin-pwa` (Workbox) generates the service worker. Runtime caching: **stale-while-revalidate** for `/market-prices`, `/weather`, `/marketplace`, `/matches`; **network-only** for `/auth/*` (never cached).
- `offline/writeQueue.ts` persists queued mutations to IndexedDB with a monotonically increasing sequence so replay order is deterministic. On reconnect it drains the queue and reports per-item success/failure back to the UI.
- An `OfflineBanner` component subscribes to `navigator.onLine` plus a `/ready` probe, and disables network-only actions (e.g. sending a chat message) rather than letting them fail after a tap.
- Every cached-data surface renders an "as of" timestamp. Stale data shown without a timestamp is treated as a bug, not a cosmetic gap — it is how a farmer ends up acting on yesterday's mandi price.

---

## 14. Roadmap & Phasing

| Phase | Scope |
|---|---|
| **Foundation** | Frontend scaffold (Vite + Tailwind v4 token system + `ThemeProvider` + pre-paint script), auth screens wired to the live API, `preferences` on the user model + `PATCH /users/me/preferences`. **Build the theme layer first** — retrofitting semantic tokens across a finished UI means touching every component. |
| **MVP** | Home/About/Contact/Privacy/Terms, Crop Recommendation, Crop Prediction, Listings, Requirements, rule-based Matching, Marketplace browse + map view (§5.8), Settings with Appearance panel (§5.13) |
| **V1.1** | Mandi prices (§5.9) and Weather (§5.10) pages + their cached backend modules; crop-prediction switched to a live mandi-price input; reliability badge and land-unit helper (§5.14) |
| **V1.2** | Offline-first PWA (§5.12), crop disease diagnosis (§5.11), Messaging (Socket.io), Orders, dashboard analytics/funnel |
| **V1.3** | Voice input across forms & chat, local language support (2–3 languages), severe-weather push alerts |
| **V2** | ML-based matching/recommendation (replacing rule-based scoring), reliability scoring refined from real order history, community/knowledge hub, government schemes navigator |

> The offline PWA is *implemented* late but *architected* now (§3, §13). Stack choice, PWA plugin wiring, and the cached-vs-network-only API split are settled up front so V1.2 is additive rather than a rewrite.

---

## 15. Master Build Prompt

Copy-paste into your AI coding assistant to scaffold the project:

```
Build AgriMatch — a farmer-buyer agri-marketplace, production-ready, in TypeScript.

Brand: AgriMatch, default accent #13db0f.
Monorepo: backend/ (Express + Mongoose + TypeScript), frontend/ (React + Vite + Tailwind v4 + TypeScript).

VERSION SAFETY: before writing any package.json, web-search each dependency for its latest
stable release and any open security advisory, then confirm with `npm show <pkg> version`.
Never copy a version number from this document. Note: Tailwind v4 is CSS-first — there is no
tailwind.config.js; tokens live in an @theme block in src/index.css.

THEMING (build this layer first, before any feature screen):
- Semantic CSS custom properties, not raw colors. Components use only semantic utilities
  (bg-surface, text-muted, border-border-default). No `dark:` variants in component markup.
- Tokens: --primary, --primary-fg, --bg, --surface, --elevated, --text, --text-muted,
  --border, --radius. Status colors (success/warning/danger) are NOT user-themable.
- Light + dark + system mode via a `dark` class on <html> (class-based, not media-query-only),
  declared with @custom-variant dark (&:where(.dark, .dark *)).
- Eight preset accents (AgriMatch Green default, plus Sky/Indigo/Violet/Rose/Amber/Teal/Slate).
  --primary-fg is derived from the accent's contrast ratio, never hardcoded per preset.
- A blocking inline script in index.html applies the stored mode + accent BEFORE first paint
  (no flash of the wrong theme). It must share logic with theme/applyTheme.ts.
- Settings → Appearance: Light/Dark/System segmented control, accent swatch row with live
  preview, reset-to-default, and a large-text/high-contrast accessibility toggle.
- Persist to localStorage for instant paint (theme preference only — never an auth token)
  and reconcile with PATCH /api/v1/users/me/preferences. Apply optimistically; a failed save
  must not revert the visible theme.
- Dark mode layers surfaces by lightness step, not by shadow, and never uses pure #000.

AUTH: email OR phone number only (no social login) — OTP verification + password.
JWT access (15min) returned in JSON and held IN MEMORY ONLY, refresh (7d) in
HttpOnly; Secure; SameSite=Strict cookie. Single-flight refresh interceptor on 401.
Role selection (farmer/buyer) required immediately after first verification.
GET /auth/me returns preferences and is the client's source of truth for the theme on login.

PAGES: Home (Header + Hero), About, Contact Us, Privacy Policy, Terms & Conditions,
Login/Sign up, Role Picker, Farmer Dashboard (role-gated), Buyer Dashboard (role-gated),
and shared Marketplace (+ map view) / Market Prices / Weather / Messages / Orders / Settings.
Public marketing routes are prerendered to static HTML at build time for SEO; authenticated
routes are client-only and noindex.

CORE MODULES (build in this order — recommendation feeds prediction, not parallel tools):
- crop-recommendation: landSizeAcres, soilType, season, location → ranked crop list with
  suitabilityScore, demandRate, riskRate, reason; each result has a "run profit prediction on
  this crop" action that pre-fills the next module
- crop-prediction: cropName, location, estimatedYieldKg, estimatedCost → estimatedRevenue,
  estimatedProfit, recommendedBuyers. Revenue should come from live mandi price data.
- crop-listings (farmer supply) and buyer-requirements (buyer demand) with a rule-based matching
  service (hard filters: crop + location radius + date; soft scoring: price fit, quantity fit,
  quality match, reliability score)
- market-prices: Agmarknet/eNAM mandi rates, cached server-side and refreshed by a cron job.
  Every price response MUST include source + fetchedAt + per-mandi priceDate. A price is never
  rendered without an "as of" timestamp.
- weather: current + 7-day forecast for the farm's coordinates, plus GENERATED actionable
  advisories ("irrigate in 2 days", "don't spray today — wind", "harvest before Thursday"),
  not raw numbers. Severe-weather alerts pushed as notifications.
- crop-health: photo → vision model → { disease, confidence, severity, treatmentSteps[],
  preventionTips[], alternatives[] }. Downscale the image client-side before upload. Below a
  confidence threshold return disease:"uncertain" + ranked alternatives and surface a helpline —
  never present a confident-sounding wrong diagnosis. Ownership-checked scan history.
- map view: listings/requirements as clustered markers (Leaflet + OSM), radius filter that
  drives both map and list
- reliability badge: the matching engine already computes a reliability score (neutral 70 with
  no history). Surface ONLY the aggregated trust signal — show "New" rather than the raw default
  when there is no history.
- land-unit converter: acre | hectare | bigha | guntha inline beside area/quantity/price fields,
  with the unit always stated explicitly
- orders: created from an agreed match, status pending → confirmed → shipped → delivered
- messages: Socket.io chat scoped to a match thread, JWT-guarded on connection
- offline-first PWA (vite-plugin-pwa / Workbox): cached app shell; stale-while-revalidate for
  prices/weather/marketplace/matches; network-only for /auth/*; queued writes in IndexedDB
  drained in order on reconnect, with visible retry/discard for failures; offline banner that
  disables network-only actions. The service worker must never cache Authorization headers,
  auth responses, or any /api/v1/auth request.
- voice input: reusable component using Web Speech API with typed-input fallback, present on
  every major form and chat screen from the first release — not a later add-on
- localization: react-i18next wrapping the whole app from day one, language switcher at signup,
  with Indic-script font support and locale-correct number/date/currency formatting

PRIVACY RULE: a user only ever sees aggregated trust signals about a matched counterparty
(e.g. typical order size, on-time rate) — never that counterparty's own dashboard, other
listings, or other conversations.

SECURITY: helmet, cors (explicit origin list), inline NoSQL-operator sanitizer (NOT
express-mongo-sanitize — it is incompatible with Express 5), express-rate-limit (30/min on
/auth incl. OTP send), Zod validation on every route and on the preferences enum whitelist,
assertOwnership() in every resource controller (404 not 403), bcrypt for passwords + hashed
refresh tokens, server-side MIME/size validation on uploaded scan images, GET /health + GET /ready.
/health returns 200 while the process is alive; /ready returns 503 when the DB is down.

Deliverables: .env.example (both apps), README with setup, Postman collection, full API docs
per endpoint following the standard response shape { success, data } / { success, error }.
```

---

*This PRD is a living document — update the Roadmap and API sections as features ship, and never let dependency version numbers in this file go stale (see Version Safety Rule in §3).*