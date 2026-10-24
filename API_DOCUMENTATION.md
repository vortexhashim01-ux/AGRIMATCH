# AgriMatch REST API Documentation

**Base URL:** `http://localhost:5000/api/v1`
**Version:** 2.1
**Last updated:** 2026-10-21
**Auth:** JWT — either `Authorization: Bearer <accessToken>` **or** the HTTP-only `accessToken` cookie. Refresh uses the HTTP-only `refreshToken` cookie.

Every endpoint below is **mounted and reachable** on the running server. This document covers all 15 route modules plus the two system probes.

| Action (product language) | HTTP meaning in AgriMatch | Endpoints |
|---|---|---|
| **Approve** (create / confirm / publish) | Create a resource, confirm an OTP, or set a record back to its open state | `POST /auth/register`, `POST /auth/otp/verify`, `POST /auth/reset-password`, `POST /farm-profiles`, `POST /crop-listings`, `POST /crop-listings/:id/approve`, `POST /buyer-requirements`, `POST /buyer-requirements/:id/approve`, `POST /matches/:id/accept`, `POST /orders`, `POST /messages/threads`, `POST /messages/threads/:threadId/messages` |
| **Change** (update) | Partial update of an owned resource, or a status transition | `PATCH /farm-profiles/:id`, `PATCH /crop-listings/:id`, `PATCH /crop-listings/:id/status`, `PATCH /buyer-requirements/:id`, `PATCH /buyer-requirements/:id/status`, `PATCH /users/me/preferences`, `PATCH /orders/:id/status`, `PATCH /crop-health/scans/:id/resolve`, `POST /auth/select-role`, `POST /matches/:id/reject` |
| **Discard** (delete / drop session) | Soft-delete listings & requirements, soft-delete a prediction, or log out | `POST /crop-listings/:id/discard`, `DELETE /crop-listings/:id`, `POST /buyer-requirements/:id/discard`, `DELETE /buyer-requirements/:id`, `DELETE /farm-profiles/:id`, `DELETE /crop-predictions/:id`, `POST /auth/logout` |

Three modules proxy external data providers and are **cache-first**:

| Module | Provider | Cache TTL | Behaviour without a provider key |
|---|---|---|---|
| `/market-prices` | data.gov.in Agmarknet | 6 h | **503** `PROVIDER_NOT_CONFIGURED` (or a stale snapshot when one exists) |
| `/weather` | OpenWeatherMap | 3 h | **503** `PROVIDER_NOT_CONFIGURED` (or a stale snapshot when one exists) |
| `/crop-health` | OpenAI-compatible vision model | none | **503** `PROVIDER_NOT_CONFIGURED` |

---

## Table of contents

1. [Conventions](#1-conventions)
2. [Status codes](#2-status-codes)
3. [Error code index](#3-error-code-index)
4. [Authentication — `/auth`](#4-authentication--auth)
5. [Farm profiles — `/farm-profiles`](#5-farm-profiles--farm-profiles)
6. [Crop listings — `/crop-listings`](#6-crop-listings--crop-listings)
7. [Buyer requirements — `/buyer-requirements`](#7-buyer-requirements--buyer-requirements)
8. [Matching engine — `/matches`](#8-matching-engine--matches)
9. [Marketplace — `/marketplace`](#9-marketplace--marketplace)
10. [Crop predictions — `/crop-predictions`](#10-crop-predictions--crop-predictions)
11. [Crop recommendations — `/crop-recommendations`](#11-crop-recommendations--crop-recommendations)
12. [Notifications — `/notifications`](#12-notifications--notifications)
13. [Users — `/users`](#13-users--users)
14. [Orders — `/orders`](#14-orders--orders)
15. [Messages — `/messages`](#15-messages--messages)
16. [Crop health — `/crop-health`](#16-crop-health--crop-health)
17. [Market prices — `/market-prices`](#17-market-prices--market-prices)
18. [Weather — `/weather`](#18-weather--weather)
19. [Health and readiness](#19-health-and-readiness)
20. [Global and catch-all errors](#20-global-and-catch-all-errors)
21. [Auth and ownership pipeline](#21-auth-and-ownership-pipeline)
22. [MCP tools](#22-mcp-tools)
23. [Appendix — client decision tree](#appendix--client-decision-tree)

---

## 1. Conventions

### Success envelope

```json
{
  "success": true,
  "data": {},
  "message": "Optional. Present on some actions such as logout and delete."
}
```

### Error envelope

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable explanation",
    "details": [
      { "field": "email", "message": "Invalid email" }
    ]
  }
}
```

`error.details` is present **only** for `VALIDATION_ERROR` (HTTP **400**).

### Headers and cookies

| Name | Where | Notes |
|---|---|---|
| `Authorization: Bearer <jwt>` | Request header | Preferred for API clients. Optional when the `accessToken` cookie is present — `requireAuth` accepts either. |
| `accessToken` cookie | HTTP-only, path `/`, 15 minutes | Set on register, password login, OTP verify, demo login, select-role, refresh |
| `refreshToken` cookie | HTTP-only, path `/api/v1/auth`, 7 days | Required by `POST /auth/refresh` and used by `/auth/logout` when the access token is already expired |
| CORS | `credentials: true` | Origins from `CORS_ORIGINS` (default `http://localhost:3000,http://localhost:5173`). Methods: GET, POST, PATCH, DELETE, OPTIONS. A disallowed `Origin` receives **no** `Access-Control-Allow-Origin` header. |
| JSON body limit | 10 KB | Oversized bodies are rejected by Express (typically **413**) |

Cookies are `httpOnly`, `sameSite=lax` + `secure=false` in development, and `sameSite=none` + `secure=true` in production.

> **Frontend note:** the browser will only send/receive these cookies if your fetch/axios call sets `credentials: 'include'` (fetch) or `withCredentials: true` (axios).

### Route-level auth

- Routes under a router that calls `router.use(requireAuth)` require a valid token for **every** endpoint in that router. This applies to `/farm-profiles`, `/crop-listings`, `/buyer-requirements`, `/matches`, `/crop-predictions`, `/crop-recommendations`, `/notifications`, `/users`, `/orders`, `/messages`, `/crop-health`, `/market-prices`, `/weather` — and to `/auth/select-role` and `/auth/me` individually.
- `/auth/register`, `/auth/login/password`, `/auth/otp/request`, `/auth/otp/verify`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/demo-login`, `/auth/refresh`, `/auth/logout` are **public**.
- `/marketplace` and the health probes are **public**.
- `roleGuard('farmer')` narrows a route further: `/crop-health/*` is farmer-only. `/orders` and `/messages` accept **either** role, because both a farmer and a buyer take part in a deal.

---

## 2. Status codes

| Code | Name | When AgriMatch returns it |
|---|---|---|
| **200** | OK | Most reads, updates, logins, OTP request/verify, reset, refresh, logout, health, ready (DB up) |
| **201** | Created | Register, create farm profile, create crop listing, create buyer requirement, generate prediction, generate recommendation, create order, send message |
| **400** | Bad Request | Zod validation failure; malformed JSON body; invalid OTP; expired OTP; demo login with the wrong demo password; missing upload field; unsupported image MIME type |
| **401** | Unauthorized | Missing/invalid/expired access token; missing refresh cookie; bad credentials; revoked/invalid refresh token |
| **403** | Forbidden | Account disabled; role not permitted for the route; caller is not the owner of the resource |
| **404** | Not Found | Unknown resource id; unknown user; unknown `/api/v1/...` route |
| **409** | Conflict | Duplicate user (email/phone); farmer already has a farm profile; match not in a state that allows the action; an order already exists for a match; an illegal order status transition; an admin changing their own account status |
| **413** | Payload Too Large | JSON body larger than 10 KB; uploaded image larger than 5 MB (`FILE_TOO_LARGE`) |
| **429** | Too Many Requests | Global `/api` limiter (100/min); auth limiter (30/min); OTP request window; too many wrong OTP guesses |
| **500** | Internal Server Error | OTP send failure; unhandled exceptions |
| **502** | Bad Gateway | An external data provider returned a non-2xx response (`PROVIDER_UNAVAILABLE`, `VISION_UNAVAILABLE`) |
| **503** | Service Unavailable | `GET /ready` when MongoDB is not connected; a provider key is not configured (`PROVIDER_NOT_CONFIGURED`) |
| **504** | Gateway Timeout | An external data provider did not answer within 8 s (`PROVIDER_TIMEOUT`) |

`OPTIONS` preflight returns **204** with no application body.

---

## 3. Error code index

| `error.code` | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body/params/query failed Zod. Inspect `error.details[]`. Also used by `POST /auth/demo-login` for a wrong demo password. |
| `INVALID_OTP` | 400 | Wrong code, or no OTP stored for that phone. |
| `OTP_EXPIRED` | 400 | OTP older than 10 minutes, or the code was already consumed. |
| `INVALID_CREDENTIALS` | 401 | Unknown email/phone **or** wrong password **or** account without a password (OTP-only) — the same code is used on purpose. |
| `UNAUTHORIZED` | 401 | No/invalid access token; missing refresh cookie; invalid or inactive account in `requireAuth`. |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh JWT invalid, user missing/inactive, or hash mismatch (rotated token reuse). |
| `REFRESH_REVOKED` | 401 | `refreshTokenHash` is null — after logout, after a password reset, or after reuse of a rotated token. |
| `INVALID_ACCOUNT` | 401 | `select-role`: user missing or inactive. |
| `ACCOUNT_DISABLED` | 403 | `isActive === false` on password login, OTP verify, demo login, or reset. |
| `FORBIDDEN` | 403 | Role not allowed by `roleGuard`, or caller is not the owner (`assertOwnership`). |
| `NOT_FOUND` | 404 | Id missing in the controller lookup, or no matching `/api/v1` route. |
| `USER_NOT_FOUND` | 404 | OTP verify / reset: no user for that phone. `/me`: token user no longer in DB. |
| `FARM_PROFILE_NOT_FOUND` | 404 | Farm profile missing for this farmer. |
| `FARM_PROFILE_FORBIDDEN` | 403 | Crop recommendation: the referenced profile belongs to another farmer. |
| `CROP_LISTING_NOT_FOUND` | 404 | Listing missing, discarded, or `_id`+`farmerId` mismatch in the service layer. |
| `CROP_LISTING_FORBIDDEN` | 403 | Matching: the listing belongs to another farmer. |
| `BUYER_REQUIREMENT_NOT_FOUND` | 404 | Requirement missing, discarded, or `_id`+`buyerId` mismatch. |
| `BUYER_REQUIREMENT_FORBIDDEN` | 403 | Matching: the requirement belongs to another buyer. |
| `MATCH_NOT_FOUND` | 404 | Match id not found in the service layer. |
| `MATCH_INVALID_STATE` | 409 | The match cannot accept/reject from its current status. |
| `PROFILE_NOT_FOUND` | 404 | Crop prediction: `farmProfileId` does not resolve. |
| `LOCATION_REQUIRED` | 400 | Crop prediction: neither `farmProfileId` nor `location` was provided. |
| `CROP_NOT_FOUND_IN_KB` | 404 | Crop prediction: `cropName` is not in the crop knowledge base. Matching is case-insensitive and **partial**, and honours aliases — `Paddy` resolves to `Rice (Paddy)`, `tamatar`/`aloo`/`moong` resolve to their English crops. |
| `USER_EXISTS` | 409 | Register: email or phone already used. |
| `FARM_PROFILE_EXISTS` | 409 | Farmer already has a profile (one per farmer). |
| `ORDER_ALREADY_EXISTS` | 409 | `POST /orders`: this match already has an order (one deal per match). |
| `ORDER_MATCH_NOT_ACCEPTED` | 409 | `POST /orders`: the match is not `accepted` yet — both sides must accept first. |
| `ORDER_INVALID_STATE` | 409 | `PATCH /orders/:id/status`: the requested transition is not allowed from the current status. |
| `PROVIDER_NOT_CONFIGURED` | 503 | The API key for Agmarknet, OpenWeatherMap or the vision model is missing or still a placeholder. |
| `PROVIDER_UNAVAILABLE` / `VISION_UNAVAILABLE` | 502 | The upstream provider answered with a non-2xx status, or sent an unparseable payload. |
| `PROVIDER_TIMEOUT` | 504 | The upstream provider did not respond within 8 s. Only surfaced when no cached snapshot exists. |
| `LOCATION_NOT_FOUND` | 404 | Geocoding could not resolve `district` + `state` to coordinates. |
| `ORDER_NOT_FOUND` | 404 | `/orders/:id` or its status route: no order with that id belongs to the caller. |
| `SCAN_NOT_FOUND` | 404 | `/crop-health/scans/:id/resolve`: no scan with that id belongs to the caller. |
| `INVALID_FILE_TYPE` | 400 | `/crop-health/diagnose`: the uploaded file is not JPEG, PNG or WebP. |
| `FILE_TOO_LARGE` | 413 | `/crop-health/diagnose`: the uploaded image exceeds 5 MB. |
| `RATE_LIMITED` | 429 | More than 5 OTP **requests** for the same phone in 60 minutes. |
| `OTP_ATTEMPTS_EXCEEDED` | 429 | More than 5 failed OTP **guesses**; request a new OTP. |
| `OTP_SEND_FAILED` | 500 | The SMS send path threw (relevant only when `OTP_DELIVERY_MODE=live`). |
| `INTERNAL_ERROR` | 500 | Unhandled error, including a malformed JSON body. In production, non-operational errors hide the real message. |

`express-rate-limit` **429** responses on `/api` and `/api/v1/auth` are **not** this envelope; they use the library default body.

---

## 4. Authentication — `/auth`

**Prefix:** `/api/v1/auth`
**Extra limiter:** 30 requests per minute per IP (on top of 100/min on `/api`).

### 4.1 Register — approve a new account

**POST** `/auth/register` — **Public**

| Field | Type | Required | Rules |
|---|---|---|---|
| `fullName` | string | yes | 2–100 chars |
| `email` | string | email **or** phone | Valid email, or omit / empty |
| `phone` | string | email **or** phone | E.164: `^\+?[1-9]\d{1,14}$` |
| `password` | string | no | If present, 8–128 chars. Omit for OTP-only accounts |
| `role` | string | yes | `farmer` or `buyer` only (`admin` is **not** allowed here) |
| `language` | string | no | `en` \| `hi` \| `ta` \| `bn`. Default `en` |

**201**

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "66f...",
      "fullName": "Test Farmer",
      "email": "farmer@example.com",
      "phone": "+919876543210",
      "role": "farmer",
      "language": "en",
      "isVerified": false,
      "isActive": true,
      "lastLoginAt": "2026-10-21T10:00:00.000Z",
      "createdAt": "...",
      "updatedAt": "..."
    },
    "accessToken": "eyJhbGciOi..."
  }
}
```

Access + refresh cookies are also set. `passwordHash` and `refreshTokenHash` are never returned.

| Scenario | Status | Code |
|---|---|---|
| Valid new user | **201** | — |
| Email or phone already in DB | **409** | `USER_EXISTS` |
| Neither email nor phone | **400** | `VALIDATION_ERROR` |
| Password shorter than 8 | **400** | `VALIDATION_ERROR` |
| `role: "admin"` | **400** | `VALIDATION_ERROR` |
| Auth rate limit (31st request/min) | **429** | (limiter) |

---

### 4.2 Login with password

**POST** `/auth/login/password` — **Public**

| Field | Type | Required |
|---|---|---|
| `email` | string | email **or** phone |
| `phone` | string | email **or** phone |
| `password` | string | yes |

**200** — same shape as register (`data.user` + `data.accessToken`); `lastLoginAt` is updated.

| Scenario | Status | Code |
|---|---|---|
| Correct credentials, active user | **200** | — |
| Unknown email/phone | **401** | `INVALID_CREDENTIALS` |
| Wrong password | **401** | `INVALID_CREDENTIALS` |
| Account has no password (OTP-only, e.g. a demo account) | **401** | `INVALID_CREDENTIALS` |
| `isActive: false` | **403** | `ACCOUNT_DISABLED` |
| Missing identifier or password | **400** | `VALIDATION_ERROR` |

> Demo accounts created by `/auth/demo-login` have **no password**, so `/auth/login/password` will always return `401` for them. Use `/auth/demo-login`.

---

### 4.3 Request OTP

**POST** `/auth/otp/request` — **Public**

| Field | Type | Required | Notes |
|---|---|---|---|
| `phone` | string | **yes** | Delivery is SMS to this number only |
| `email` | string | no | Accepted by the schema but **not used** to send an OTP (email OTP delivery is disabled) |

**200** → `{ "success": true, "data": { "sent": true, "expiresIn": 600 } }`

6-digit OTP, 10-minute TTL. Max **5 requests per phone per 60 minutes**.

| Scenario | Status | Code |
|---|---|---|
| OTP stored and send path succeeded | **200** | — |
| 6th request in 60 minutes for the same phone | **429** | `RATE_LIMITED` |
| Send path throws (live mode only) | **500** | `OTP_SEND_FAILED` |
| Missing/invalid phone | **400** | `VALIDATION_ERROR` |

**Where does the OTP go?** Controlled by `OTP_DELIVERY_MODE`:
- `console` (current default) — printed to the server log as `[OTP] +91... (sms): 123456`
- `mock` — logged, not sent
- `live` — sent via MSG91 (requires real `MSG91_AUTH_KEY` + `MSG91_OTP_TEMPLATE_ID`)

---

### 4.4 Verify OTP — phone login

**POST** `/auth/otp/verify` — **Public**

| Field | Type | Required | Rules |
|---|---|---|---|
| `phone` | string | yes | E.164 |
| `otp` | string | yes | Exactly 6 characters |
| `purpose` | string | no | `login` \| `verify` \| `reset_password`. Default `verify`. Accepted but **not used** — all purposes run the same login path. Use `/auth/reset-password` to change a password. |
| `email` | string | no | Ignored for lookup; the user is found by `phone` |

**200** — issues a session (`data.user` + `data.accessToken`) and sets `isVerified: true`.

| Scenario | Status | Code |
|---|---|---|
| Correct OTP, user exists, active | **200** | — |
| Wrong code | **400** | `INVALID_OTP` |
| Expired / no record | **400** | `OTP_EXPIRED` or `INVALID_OTP` |
| Too many wrong guesses | **429** | `OTP_ATTEMPTS_EXCEEDED` |
| Phone not registered | **404** | `USER_NOT_FOUND` |
| Account disabled | **403** | `ACCOUNT_DISABLED` |

---

### 4.5 Forgot password — request a reset OTP

**POST** `/auth/forgot-password` — **Public**

| Field | Type | Required | Rules |
|---|---|---|---|
| `phone` | string | yes | E.164 |

**200** → `{ "success": true, "data": { "sent": true, "expiresIn": 600 } }`

Sends a 6-digit reset OTP to the account's phone. **Always reports success**, even when no account exists, so the endpoint cannot be used to enumerate registered phone numbers. Password reset is **phone-based only** because email OTP delivery is disabled.

| Scenario | Status | Code |
|---|---|---|
| OTP stored and sent | **200** | — |
| Phone not registered | **200** | — (no OTP sent; response is identical) |
| 6th request in 60 minutes for the same phone | **429** | `RATE_LIMITED` |
| Missing/invalid phone | **400** | `VALIDATION_ERROR` |

---

### 4.6 Reset password — apply a new password

**POST** `/auth/reset-password` — **Public**

| Field | Type | Required | Rules |
|---|---|---|---|
| `phone` | string | yes | E.164 |
| `otp` | string | yes | Exactly 6 characters — the code from `/auth/forgot-password` |
| `newPassword` | string | yes | 8–128 chars |

**200**

```json
{
  "success": true,
  "message": "Password reset successfully. Please log in with your new password.",
  "data": { "user": { "_id": "66f...", "phone": "+919876543210", "role": "farmer" } }
}
```

Side effects: the OTP is consumed (it cannot be reused), the password hash is replaced, and **all existing sessions are revoked** (`refreshTokenHash` is cleared, so any previously issued refresh cookie returns `401 REFRESH_REVOKED`).

| Scenario | Status | Code |
|---|---|---|
| Correct OTP | **200** | — |
| Wrong code | **400** | `INVALID_OTP` |
| OTP already used / expired | **400** | `OTP_EXPIRED` |
| Too many wrong guesses | **429** | `OTP_ATTEMPTS_EXCEEDED` |
| No user for that phone | **404** | `USER_NOT_FOUND` |
| Account disabled | **403** | `ACCOUNT_DISABLED` |
| Password under 8 chars | **400** | `VALIDATION_ERROR` |

> `POST /auth/reset-password` does **not** log the user in. Call `/auth/login/password` afterwards.

---

### 4.7 Select role

**POST** `/auth/select-role` — **Auth required**

| Field | Type | Required | Rules |
|---|---|---|---|
| `role` | string | yes | `farmer` or `buyer` |

**200** — updates the user's role and issues a **fresh** access token + cookies (the old token still carries the old role, so the client must adopt the new one).

| Scenario | Status | Code |
|---|---|---|
| Authenticated, valid role | **200** | — |
| Missing/invalid role | **400** | `VALIDATION_ERROR` |
| No/invalid token | **401** | `UNAUTHORIZED` |

---

### 4.8 Demo login

**POST** `/auth/demo-login` — **Public** — no body schema validation (manual check)

| Field | Type | Required | Rules |
|---|---|---|---|
| `identifier` | string | yes | An email or a phone number |
| `password` | string | yes | Must be exactly `123456` |

**200** — creates the user on first use (`role: 'farmer'`, `isVerified: true`, **no password**), otherwise logs the existing user in. Sets cookies and returns `data.user` + `data.accessToken`.

| Scenario | Status | Code |
|---|---|---|
| Correct demo password | **200** | — |
| Wrong password or empty identifier | **400** | `VALIDATION_ERROR` |
| Existing account is disabled | **403** | `ACCOUNT_DISABLED` |

---

### 4.9 Refresh token

**POST** `/auth/refresh` — **Public, requires the `refreshToken` cookie**

Refresh **rotates**: the previous refresh cookie is invalid after a successful call.

| Scenario | Status | Code |
|---|---|---|
| Valid cookie, matching hash, active user | **200** | — new access + refresh cookies, `data.user` + `data.accessToken` |
| Cookie missing | **401** | `UNAUTHORIZED` |
| User missing or inactive | **401** | `INVALID_REFRESH_TOKEN` |
| Logged out / password reset | **401** | `REFRESH_REVOKED` |
| Reusing an already-rotated token | **401** | `INVALID_REFRESH_TOKEN` |

---

### 4.10 Logout — discard session

**POST** `/auth/logout` — **Public by design**

Deliberately **not** behind `requireAuth`: an expired access token must still be able to end the session and clear cookies. If `req.userId` is present it revokes by user id; otherwise it falls back to the `refreshToken` cookie.

**200**

```json
{ "success": true, "message": "Logged out successfully" }
```

| Scenario | Status | Code |
|---|---|---|
| Valid token or refresh cookie | **200** | — `refreshTokenHash` nulled; both cookies cleared |
| No token and no refresh cookie | **200** | — idempotent no-op |

---

### 4.11 Current user

**GET** `/auth/me` — **Auth required**

**200** → sanitized user object in `data`.

| Scenario | Status | Code |
|---|---|---|
| Valid token, user exists | **200** | — |
| No / bad / expired token | **401** | `UNAUTHORIZED` |
| User deleted but token still valid | **404** | `USER_NOT_FOUND` |

---

## 5. Farm profiles — `/farm-profiles`

**All routes require auth** (`router.use(requireAuth)`).

| Method | Path | Role | Product action |
|---|---|---|---|
| POST | `/farm-profiles` | `farmer` | **Approve / create** the farmer's one profile |
| GET | `/farm-profiles/me` | `farmer` | Read own profile (`data` may be `null`) |
| GET | `/farm-profiles/:id` | any authenticated role | Read by id |
| PATCH | `/farm-profiles/:id` | `farmer` **and owner** | **Change** |
| DELETE | `/farm-profiles/:id` | `farmer` **and owner** | **Discard** (hard delete) |

Constraint: exactly **one farm profile per farmer** (unique index + service check).

### 5.1 Create (approve)

**POST** `/farm-profiles`

| Field | Type | Required | Rules |
|---|---|---|---|
| `farmName` | string | no | Max 200 |
| `addressLine1` | string | yes | 1–255 |
| `addressLine2` | string | no | Max 255 |
| `city` | string | yes | 1–100 |
| `district` | string | yes | 1–100 |
| `state` | string | yes | 1–100 |
| `pincode` | string | yes | Exactly 6 digits |
| `country` | string | no | Default `India` |
| `totalLandArea` | number | yes | Min 0.01 |
| `landUnit` | string | no | `acre` \| `hectare` \| `bigha` \| `guntha`. Default `acre` |
| `farmSize` | string | yes | `micro` \| `small` \| `medium` \| `large` \| `very_large` |
| `farmingMethod` | string | yes | `organic` \| `conventional` \| `mixed` \| `natural` |
| `certificationType` | string | no | Max 100 |
| `certificationNumber` | string | no | Max 100 |
| `waterSources` | string[] | no | `rainfed`, `well`, `canal`, `borewell`, `river`, `tank`, `drip`. Default `[]` |
| `numberOfWorkers` | integer | no | Min 0 |
| `experienceYears` | integer | no | 0–100 |
| `primaryCrops` | string[] | no | Default `[]` |
| `isActive` | boolean | no | Default `true` |

| Scenario | Status | Code |
|---|---|---|
| Farmer with no profile, valid body | **201** | — |
| Missing token | **401** | `UNAUTHORIZED` |
| Buyer (non-farmer) | **403** | `FORBIDDEN` |
| Farmer already has a profile | **409** | `FARM_PROFILE_EXISTS` |
| Bad enum / pincode not 6 digits / land ≤ 0.01 | **400** | `VALIDATION_ERROR` |

### 5.2 Get my profile

**GET** `/farm-profiles/me` — `farmer` only.

| Scenario | Status | Body |
|---|---|---|
| Profile exists | **200** | `data`: profile object |
| Never created one | **200** | `data: null` (this is **not** 404) |
| Not a farmer | **403** | `FORBIDDEN` |

### 5.3 Get by id

**GET** `/farm-profiles/:id` — any authenticated role.

| Scenario | Status | Code |
|---|---|---|
| Id exists | **200** | — |
| Id not in DB | **404** | `NOT_FOUND` |
| Malformed ObjectId (e.g. `abc`) | **400** | `VALIDATION_ERROR` |

### 5.4 Change (PATCH)

**PATCH** `/farm-profiles/:id` — partial body; any subset of the create schema. Empty `{}` is valid and returns the unchanged document.

| Scenario | Status | Code |
|---|---|---|
| Owner patches valid fields | **200** | — |
| Buyer token | **403** | `FORBIDDEN` |
| Farmer A patches Farmer B's id | **403** | `FORBIDDEN` |
| Unknown id | **404** | `NOT_FOUND` |
| Invalid enum / pincode / land value | **400** | `VALIDATION_ERROR` |

### 5.5 Discard (DELETE)

**DELETE** `/farm-profiles/:id` — hard delete. After discard, `GET /farm-profiles/me` returns `data: null` and the farmer may create again.

**200** → `{ "success": true, "message": "Farm profile deleted successfully" }`

| Scenario | Status | Code |
|---|---|---|
| Owner deletes own profile | **200** | — |
| Already deleted / unknown id | **404** | `NOT_FOUND` |
| Buyer | **403** | `FORBIDDEN` |
| Farmer A deletes Farmer B's profile | **403** | `FORBIDDEN` |

---

## 6. Crop listings — `/crop-listings`

**All routes require auth.** Write routes are `farmer`-only.

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/crop-listings` | `farmer` | Create; publishes as `active` |
| GET | `/crop-listings/me` | `farmer` | Own listings (filters supported) |
| GET | `/crop-listings` | any authenticated | All listings (filters supported) |
| POST | `/crop-listings/:id/approve` | `farmer` **+ owner** | Set back to `active` |
| POST | `/crop-listings/:id/discard` | `farmer` **+ owner** | Soft delete |
| PATCH | `/crop-listings/:id/status` | `farmer` **+ owner** | Change status |
| GET | `/crop-listings/:id` | any authenticated | Read by id |
| PATCH | `/crop-listings/:id` | `farmer` **+ owner** | Partial update |
| DELETE | `/crop-listings/:id` | `farmer` **+ owner** | Soft delete (same as discard) |

### 6.1 Create

**POST** `/crop-listings` — **201**

| Field | Type | Required | Rules |
|---|---|---|---|
| `cropName` | string | yes | 1–100 |
| `quantityKg` | number | yes | Min 0.01 |
| `expectedPricePerKg` | number | yes | Min 0 |
| `qualityGrade` | string | no | `A` \| `B` \| `C` |
| `harvestDate` | date | no | Coerced |
| `location` | object | no | `address` (≤255), `state` (≤100), `district` (≤100), `pincode` (6 digits), `lat` (−90..90), `lng` (−180..180) |

Response `message`: `"Crop listing approved and published as active"`.

### 6.2 List / query parameters

Used by both `GET /crop-listings` and `GET /crop-listings/me`:

| Param | Type | Notes |
|---|---|---|
| `cropName` | string | |
| `minPricePerKg` | number | |
| `maxPricePerKg` | number | |
| `qualityGrade` | string | `A` \| `B` \| `C` |
| `state` | string | |
| `district` | string | |
| `status` | string | `active` \| `matched` \| `sold` \| `expired` |
| `limit` | integer | 1–50 |

**200** → `data: { count, listings: [...] }`. Actors only see their **own** records on `/me`; discarded (`isDeleted`) listings are excluded.

### 6.3 Status values

`active` → `matched` → `sold`, or `expired`. Set via `PATCH /crop-listings/:id/status` with body `{ "status": "sold" }`.

| Scenario | Status | Code |
|---|---|---|
| Unknown id | **404** | `NOT_FOUND` |
| Not the owner | **403** | `FORBIDDEN` |
| Bad status value | **400** | `VALIDATION_ERROR` |
| Malformed ObjectId | **400** | `VALIDATION_ERROR` |

---

## 7. Buyer requirements — `/buyer-requirements`

Mirror image of crop listings, for the `buyer` role. **All routes require auth**; write routes are `buyer`-only.

| Method | Path | Role |
|---|---|---|
| POST | `/buyer-requirements` | `buyer` |
| GET | `/buyer-requirements/me` | `buyer` |
| GET | `/buyer-requirements` | any authenticated |
| POST | `/buyer-requirements/:id/approve` | `buyer` **+ owner** |
| POST | `/buyer-requirements/:id/discard` | `buyer` **+ owner** |
| PATCH | `/buyer-requirements/:id/status` | `buyer` **+ owner** |
| GET | `/buyer-requirements/:id` | any authenticated |
| PATCH | `/buyer-requirements/:id` | `buyer` **+ owner** |
| DELETE | `/buyer-requirements/:id` | `buyer` **+ owner** |

### 7.1 Create

**POST** `/buyer-requirements` — **201**

| Field | Type | Required | Rules |
|---|---|---|---|
| `cropName` | string | yes | 1–100 |
| `quantityKg` | number | yes | Min 0.01 |
| `maxPricePerKg` | number | yes | Min 0 |
| `qualityGrade` | string | no | `A` \| `B` \| `C` |
| `requiredByDate` | date | no | Coerced |
| `location` | object | no | Same shape as crop listings |

Response `message`: `"Buyer requirement approved and published as open"`.

### 7.2 Query parameters

Same as crop listings except the status enum: `open` \| `matched` \| `fulfilled` \| `expired`, plus `requiredByDate` instead of `harvestDate` on the body. Response `data: { count, requirements: [...] }`.

---

## 8. Matching engine — `/matches`

**All routes require auth.**

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/matches/listings/:listingId/run` | `farmer` | Evaluate a listing against open requirements |
| POST | `/matches/requirements/:requirementId/run` | `buyer` | Evaluate a requirement against active listings |
| GET | `/matches/me` | any authenticated | Matches involving the caller (filters) |
| GET | `/matches/:id` | any authenticated | Read by id |
| POST | `/matches/:id/accept` | participant | Advance the match |
| POST | `/matches/:id/reject` | participant | Reject with an optional reason |

### 8.1 Run matching

**POST** `/matches/listings/:listingId/run` (farmer) or **POST** `/matches/requirements/:requirementId/run` (buyer)

Body (optional — defaults shown):

| Field | Type | Default | Rules |
|---|---|---|---|
| `threshold` | number | `60` | 0–100 matching score threshold |
| `limitMatches` | integer | `10` | 1–20 |

**200**

```json
{
  "success": true,
  "data": { "evaluated": 12, "newMatches": 3, "count": 3, "matches": [] }
}
```

| Scenario | Status | Code |
|---|---|---|
| Listing/requirement not owned by caller | **403** | `CROP_LISTING_FORBIDDEN` / `BUYER_REQUIREMENT_FORBIDDEN` |
| Listing/requirement missing or discarded | **404** | `CROP_LISTING_NOT_FOUND` / `BUYER_REQUIREMENT_NOT_FOUND` |
| Malformed id | **400** | `VALIDATION_ERROR` |

### 8.2 Query my matches

**GET** `/matches/me`

| Param | Type | Notes |
|---|---|---|
| `status` | string | `suggested` \| `pending` \| `accepted` \| `rejected` \| `expired` |
| `role` | string | `farmer` \| `buyer` — scope to matches on that side |
| `limit` | integer | 1–50 |

**200** → `data: { count, matches: [...] }`

### 8.3 Accept / reject

**POST** `/matches/:id/accept` — no body. **200** → `data: match`, `message: "Match accepted; status: {status}"`.

**POST** `/matches/:id/reject` — optional body `{ "reason": "string, 1–255" }`. **200** → `data: match`, `message: "Match rejected"`.

| Scenario | Status | Code |
|---|---|---|
| Match id unknown | **404** | `NOT_FOUND` / `MATCH_NOT_FOUND` |
| Match not in an acceptable state | **409** | `MATCH_INVALID_STATE` |

### 8.4 Lifecycle

```
suggested  ──(farmer or buyer responds to a suggestion)──►  pending
pending    ──(the other side accepts)────────────────────►  accepted
any        ──(reject)─────────────────────────────────────►  rejected
any        ──(cron: 15-minute sweep)──────────────────────►  expired
```

A match that is accepted/rejected/expired is not recomputed by `/run`; only open records are re-evaluated.

---

## 9. Marketplace — `/marketplace`

**GET** `/marketplace` — **Public**, no auth.

| Param | Type | Default | Notes |
|---|---|---|---|
| `cropName` | string | — | Max 80 |
| `state` | string | — | Max 60 |
| `district` | string | — | Max 60 |
| `type` | string | `all` | `listing` \| `requirement` \| `all` |
| `minPrice` | number | — | Positive |
| `maxPrice` | number | — | Positive |
| `qualityGrade` | string | — | Max 40 |
| `limit` | integer | `40` | 1–100 |
| `sort` | string | `newest` | `newest` \| `priceAsc` \| `priceDesc` |

**200**

```json
{
  "success": true,
  "data": {
    "listingsCount": 12,
    "requirementsCount": 7,
    "count": 19,
    "items": []
  }
}
```

`items` is a merged array of crop listings and buyer requirements; each item carries a discriminator so the client can tell them apart.

---

## 10. Crop predictions — `/crop-predictions`

**All routes require auth.** No role restriction (any authenticated user).

| Method | Path | Notes |
|---|---|---|
| POST | `/crop-predictions/generate` | Create a prediction (**201**) |
| GET | `/crop-predictions/me` | Own predictions |
| GET | `/crop-predictions/:id` | Read by id |
| DELETE | `/crop-predictions/:id` | Soft delete |

### 10.1 Generate

**POST** `/crop-predictions/generate` — **201**

| Field | Type | Required | Rules |
|---|---|---|---|
| `cropName` | string | yes | 2–50. Must exist in the crop knowledge base (partial, case-insensitive match) |
| `cropVariety` | string | no | Max 100 |
| `farmProfileId` | ObjectId string | conditional | Either this or `location` |
| `location` | object | conditional | `state` (1–60), `district` (1–60) |
| `farmSizeAcres` | number | yes | Positive |
| `qualityGrade` | string | no | `Premium` \| `Standard` \| `Economy`. Default `Standard` |
| `estimatedYieldQty` | number | no | Positive |
| `expectedPricePerUnit` | number | no | Positive |
| `estimatedTotalCost` | number | no | Min 0 |
| `limitRecommendedBuyers` | integer | no | 1–20. Default 10 |

Response `message`: `"Profit prediction generated and saved"`.

| Scenario | Status | Code |
|---|---|---|
| Neither `farmProfileId` nor `location` | **400** | `LOCATION_REQUIRED` |
| `farmProfileId` does not resolve | **404** | `PROFILE_NOT_FOUND` |
| Crop not in the knowledge base | **404** | `CROP_NOT_FOUND_IN_KB` |

> The crop name must match an entry in the knowledge base. `"Demo Rice"` fails; `"Rice (Paddy)"` works.

### 10.2 Query / read / delete

- `GET /crop-predictions/me` — params: `status` (`active` \| `deleted`, default `active`), `cropName` (≤80), `limit` (1–50, default 20), `sort` (`newest` \| `oldest`). **200** → `data: { count, items: [...] }`.
- `GET /crop-predictions/:id` — **200** → `data: prediction`; **404** `NOT_FOUND`.
- `DELETE /crop-predictions/:id` — soft delete. **200** → `data: prediction`, `message: "Prediction deleted"`; **404** `NOT_FOUND`.

---

## 11. Crop recommendations — `/crop-recommendations`

**All routes require auth.** `generate` and `/me` are `farmer`-only.

| Method | Path | Role |
|---|---|---|
| POST | `/crop-recommendations/generate` | `farmer` |
| GET | `/crop-recommendations/me` | `farmer` |
| GET | `/crop-recommendations/:id` | any authenticated |

### 11.1 Generate

**POST** `/crop-recommendations/generate` — **201**

| Field | Type | Required | Rules |
|---|---|---|---|
| `farmProfileId` | ObjectId string | yes | Must belong to the caller |
| `totalLandArea` | number | yes | Min 0.01 |
| `landUnit` | string | no | `acre` \| `hectare` \| `bigha` \| `guntha`. Default `acre` |
| `soilType` | string | yes | `alluvial` \| `black` \| `red` \| `laterite` \| `desert` \| `mountain` \| `peat` \| `saline` |
| `season` | string | yes | `kharif` \| `rabi` \| `zaid` \| `summer` \| `winter` \| `whole_year` |
| `location` | object | yes | `state` (2–100), `district` (2–100), `pincode` (6 digits, optional) |
| `soilPH` | number | no | 0–14 |
| `soilNitrogen` / `soilPhosphorus` / `soilPotassium` | number | no | Min 0 |
| `soilOrganicMatter` | number | no | 0–100 |
| `climateZone` | string | no | 1–100 |
| `averageRainfallMm` | number | no | Min 0 |
| `irrigationType` | string | no | `rainfed` \| `canal` \| `borewell` \| `drip` \| `sprinkler` \| `tank` \| `well` |
| `irrigationFrequencyPerWeek` | number | no | 0–21 |
| `previousCrop` | string | no | Max 100 |
| `budgetPerAcre` | number | no | Min 0 |
| `cropPreferences` | string[] | no | |
| `avoidCrops` | string[] | no | |
| `isOrganicPreferred` | boolean | no | |
| `expectedSellingPricePerKg` | number | no | Min 0 |

Response `message`: `"Generated crop recommendations ({count} crops, confidence {aiConfidence}%)"`.

| Scenario | Status | Code |
|---|---|---|
| `farmProfileId` not found | **404** | `FARM_PROFILE_NOT_FOUND` |
| Profile belongs to another farmer | **403** | `FARM_PROFILE_FORBIDDEN` |
| Buyer token | **403** | `FORBIDDEN` |

### 11.2 List / read

- `GET /crop-recommendations/me` — param `limit` (1–50, optional). **200** → `data: { count, recommendations: [...] }`.
- `GET /crop-recommendations/:id` — **200** → `data: recommendation`; **404** `NOT_FOUND`.

---

## 12. Notifications — `/notifications`

**All routes require auth.** Notifications are created by background events (match created, match accepted/rejected, etc.) and can also be pushed in real time over Socket.IO.

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | Paginated list |
| POST | `/notifications/read-all` | Mark every notification read |
| POST | `/notifications/:id/read` | Mark one notification read |

### 12.1 List

**GET** `/notifications`

| Param | Type | Notes |
|---|---|---|
| `unreadOnly` | `"true"` \| `"false"` | Transformed to a boolean |
| `limit` | integer | 1–100 |
| `page` | integer | Min 1 |

**200**

```json
{
  "success": true,
  "data": {
    "count": 5,
    "total": 12,
    "unread": 3,
    "page": 1,
    "limit": 20,
    "notifications": []
  }
}
```

### 12.2 Mark read

- `POST /notifications/read-all` — **200** → `data: { updated: n }`.
- `POST /notifications/:id/read` — **200** → `data: notification`; **404** `NOT_FOUND`.

### 12.3 Real-time (Socket.IO)

Connect to the same host/port with the JWT in the handshake (`auth.token`). The server joins the socket to a private room `user:<userId>` and emits notification events there. Handshake authentication is required — an unauthenticated socket is rejected.

Events emitted to those rooms:

| Event | Raised by |
|---|---|
| The notification's own `type` as the event name — `match:new`, `match:pending`, `match:accepted`, `match:rejected`, `match:expired`, `order:created`, `order:status`, `message:new` | Every `dispatchNotification` / `emitMatchEvent` call. There is no generic `notification:new` event: the payload is emitted under its type. |
| `message:new` **also** goes to the sender | `POST /messages/threads/:threadId/messages` — so the sender's other devices stay in sync |

Chat has no socket *handlers*: messages are written over REST and only fanned out over the socket. Reconnect → refetch, don't re-submit.

---

## 13. Users — `/users`

All routes require a valid token (`router.use(requireAuth)`).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/users` | any role | List users (e.g. a buyer browsing farmers) |
| `PATCH` | `/users/me/preferences` | any role | Update `themeMode`, `accentColor`, `largeText` |
| `PATCH` | `/users/:id/status` | `admin` | Enable or disable another account |

### 13.1 List users — directory lookup

`GET /api/v1/users?role=farmer&search=ravi&page=1&limit=20`

Returns active accounts by default. `passwordHash` and `refreshTokenHash` are excluded at the query level, so they can never appear in the response. Results are sorted newest-first.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `role` | `farmer` \| `buyer` \| `admin` | _(all)_ | Omit to list every role |
| `search` | string (≤100) | – | Case-insensitive `fullName` match; regex metacharacters are escaped |
| `status` | `active` \| `inactive` \| `all` | `active` | Only an `admin` may pass anything other than `active`; otherwise **403** |
| `page` | integer ≥ 1 | `1` | |
| `limit` | integer 1–100 | `20` | |

**Response 200**

```json
{
  "success": true,
  "data": {
    "count": 20,
    "total": 34,
    "page": 1,
    "limit": 20,
    "users": [
      { "_id": "…", "fullName": "Ravi Patil", "role": "farmer", "isActive": true, "isVerified": true, "language": "en" }
    ]
  }
}
```

`count` is the size of the current page; `total` is the full match count across all pages.

**Errors**

| Status | Code | Cause |
|---|---|---|
| **400** | `VALIDATION_ERROR` | `role` is not one of the three roles, or `limit` is outside 1–100. |
| **401** | `UNAUTHORIZED` | No/invalid token. |
| **403** | `FORBIDDEN` | A non-admin passed `status=inactive` or `status=all`. |

### 13.2 Preferences

Only the whitelisted values below are accepted. Anything else is rejected at the edge with **400** `VALIDATION_ERROR` and never reaches MongoDB.

| Field | Allowed values | Default |
|---|---|---|
| `themeMode` | `light` \| `dark` \| `system` | `system` |
| `accentColor` | `#13db0f`, `#0ea5e9`, `#6366f1`, `#8b5cf6`, `#f43f5e`, `#f59e0b`, `#14b8a6`, `#64748b` | `#13db0f` |
| `largeText` | `true` \| `false` | `false` |

**Request**

```json
PATCH /api/v1/users/me/preferences
{ "themeMode": "dark", "accentColor": "#6366f1", "largeText": true }
```

All three fields are optional — send only what changed.

**Response 200**

```json
{
  "success": true,
  "data": { "preferences": { "themeMode": "dark", "accentColor": "#6366f1", "largeText": true } },
  "message": "Preferences updated"
}
```

**Errors**

| Status | Code | Cause |
|---|---|---|
| **400** | `VALIDATION_ERROR` | An unknown `accentColor`, an unknown `themeMode`, or a non-boolean `largeText`. `error.details[]` names the offending field. |
| **401** | `UNAUTHORIZED` | No/invalid token. |
| **404** | `USER_NOT_FOUND` | The token's user no longer exists. |

The same `preferences` object is embedded in every user payload returned by `/auth/me`, `/auth/demo-login`, `/auth/select-role`, `/auth/login/password`, `/auth/otp/verify` and `/auth/refresh`, so the client can hydrate the theme at boot from an existing session. Documents created before this field existed are reconciled against the defaults on read.

### 13.3 Admin — enable / disable an account

`PATCH /api/v1/users/:id/status` — **`admin` only**.

Disabling an account is the moderation action; there is deliberately no `DELETE /users/:id`. A hard delete would orphan the listings, orders, matches, notifications and scans that reference the user, whereas `isActive: false` revokes access while keeping history intact.

**Request**

```json
{ "isActive": false }
```

Disabling also clears the stored `refreshTokenHash`, so an already-issued session cannot be renewed — without that the account would stay usable until its refresh window lapsed.

**Response 200**

```json
{
  "success": true,
  "data": { "user": { "_id": "…", "fullName": "Ravi Patil", "role": "farmer", "isActive": false } },
  "message": "Account disabled"
}
```

**Errors**

| Status | Code | Cause |
|---|---|---|
| **400** | `VALIDATION_ERROR` | `:id` is not a 24-char ObjectId, or `isActive` is missing/not a boolean. |
| **403** | `FORBIDDEN` | Caller is not an `admin`. |
| **404** | `USER_NOT_FOUND` | No user with that id. |
| **409** | `CANNOT_DISABLE_SELF` | An admin tried to change their own status (prevents locking out the last admin). |

> **Bootstrapping an admin.** No route can create an `admin` — `register` rejects the role and `select-role` accepts only `farmer`/`buyer`. Promotion is intentional manual work: set `role: "admin"` on a user document directly in MongoDB. Because `requireAuth` reads the role from the JWT payload, the promoted user must **log in again** (or refresh) before `admin` routes unlock.

---

## 14. Orders — `/orders`

All routes require a valid token. **Either role** may call them: the service resolves the caller's side of the deal and filters by it.

| Method | Path | Success | Purpose |
|---|---|---|---|
| `POST` | `/orders` | **201** | Create an order from an *accepted* match |
| `GET` | `/orders` | **200** | List my orders |
| `GET` | `/orders/:id` | **200** | Read one order |
| `PATCH` | `/orders/:id/status` | **200** | Advance or cancel the order |

### 14.1 Create

**Request**

```json
POST /api/v1/orders
{
  "matchId": "6ad8e0fa16b59a58d4570a6e",
  "quantityKg": 4000,
  "agreedPricePerKg": 21,
  "deliveryDate": "2026-11-15"
}
```

**Response 201**

```json
{
  "success": true,
  "data": {
    "_id": "6ad8e0fa16b59a58d4570a75",
    "matchId": "6ad8e0fa16b59a58d4570a6e",
    "farmerId": "6ad8e0f816b59a58d4570a6a",
    "buyerId": "6ad8e0f816b59a58d4570a6b",
    "cropName": "E2ETomato1792598265363",
    "quantityKg": 4000,
    "agreedPricePerKg": 21,
    "deliveryDate": "2026-11-15T00:00:00.000Z",
    "status": "pending"
  },
  "message": "Order created from accepted match"
}
```

Preconditions:

- The match must exist and the caller must be its `farmerId` or `buyerId` (**404** `MATCH_NOT_FOUND` otherwise).
- The match must be `accepted` — a `suggested` or `pending` match is rejected with **409** `ORDER_MATCH_NOT_ACCEPTED`. See [§8.3](#83-accept--reject) for how both sides accept.
- One order per match: a second attempt returns **409** `ORDER_ALREADY_EXISTS` (enforced by a unique index on `matchId`, so a race cannot create two).

### 14.2 Status machine

```
pending ──► confirmed ──► shipped ──► delivered
   │            │
   └────────────┴──► cancelled
```

| From | Allowed next |
|---|---|
| `pending` | `confirmed`, `cancelled` |
| `confirmed` | `shipped`, `cancelled` |
| `shipped` | `delivered` |
| `delivered` | *(terminal)* |
| `cancelled` | *(terminal)* |

`PATCH /orders/:id/status` accepts only `confirmed`, `shipped`, `delivered` or `cancelled`; `pending` is intentionally not settable. Any jump outside the table — for example `pending → delivered` — returns **409** `ORDER_INVALID_STATE` with a message such as `Cannot move an order from pending to delivered`.

**Response 200** → `data: order` (the updated document). A `cancelled` order records the caller in `cancelledById`.

**Side effect:** when an order reaches `delivered`, the linked crop listing (`Match.cropListingId`) is flipped from `active` to `sold`, so it stops appearing as an open listing for other buyers.

### 14.3 Query parameters

| Param | Type | Notes |
|---|---|---|
| `status` | `pending` \| `confirmed` \| `shipped` \| `delivered` \| `cancelled` | Optional filter |
| `role` | `farmer` \| `buyer` | Optional; narrows to the caller's side |
| `limit` | 1–50 | Optional |

**Response 200** → `data: { count, orders: [...] }`, newest first.

### 14.4 Ownership

`GET /orders/:id` and `PATCH /orders/:id/status` query **filtered by the caller**, so another user's order yields **404** `ORDER_NOT_FOUND` — the API never confirms that a foreign order exists (no 403 leak).

On success the other party is notified over Socket.IO: `order:created` on creation, `order:status` on every transition.

---

## 15. Messages — `/messages`

Chat is scoped to an accepted deal. All routes require a valid token and are restricted to the two participants of the thread.

| Method | Path | Success | Purpose |
|---|---|---|---|
| `GET` | `/messages/threads` | **200** | List my threads, most recent activity first |
| `POST` | `/messages/threads` | **200** | Open (or re-open) the thread for a match |
| `GET` | `/messages/threads/:threadId/messages` | **200** | Read a page of messages |
| `POST` | `/messages/threads/:threadId/messages` | **201** | Send a message |

### 15.1 Open a thread

**Request**

```json
POST /api/v1/messages/threads
{ "matchId": "6ad8e0fa16b59a58d4570a6e" }
```

**Response 200**

```json
{
  "success": true,
  "data": {
    "_id": "6ad8e0fd672b679d6f5b158c",
    "matchId": "6ad8e0fa16b59a58d4570a6e",
    "participantIds": ["6ad8e0f816b59a58d4570a6a", "6ad8e0f816b59a58d4570a6b"],
    "lastMessageAt": null,
    "createdAt": "2026-10-21T15:57:48.788Z"
  }
}
```

This call is **idempotent**: the same `matchId` always resolves to the same thread, so both clients can call it on mount without coordinating. A non-participant gets **404** `MATCH_NOT_FOUND`.

### 15.2 Send a message

**Request**

```json
POST /api/v1/messages/threads/6ad8e0fd672b679d6f5b158c/messages
{ "content": "Namaste, tomato ready for pickup." }
```

| Field | Required | Notes |
|---|---|---|
| `content` | yes | 1–1000 characters, trimmed |
| `contentType` | no | `text` (default) or `voice` |
| `audioUrl` | required when `contentType` is `voice` | Valid URL, ≤ 500 chars |

**Response 201** → `data: message`.

**Errors**

| Status | Code | Cause |
|---|---|---|
| **400** | `VALIDATION_ERROR` | Empty or >1000-char `content`; `contentType: "voice"` without `audioUrl` |
| **404** | `NOT_FOUND` | Thread id unknown, or the caller is not a participant |

On success the sender also receives a `message:new` socket event (multi-device sync) and the recipient is notified.

### 15.3 Read a thread

`GET /messages/threads/:threadId/messages`

| Param | Type | Notes |
|---|---|---|
| `limit` | 1–100 | Optional, defaults to the service default |
| `before` | ISO date | Optional cursor — returns the page immediately older than this instant |

**Response 200**

```json
{
  "success": true,
  "data": {
    "count": 2,
    "thread": { "_id": "...", "matchId": "...", "lastMessageAt": "2026-10-21T15:57:49.727Z", "participantIds": ["...", "..."] },
    "messages": [ { "_id": "...", "senderId": "...", "content": "Namaste, tomato ready for pickup.", "contentType": "text", "createdAt": "..." } ]
  }
}
```

Messages are returned **oldest → newest**. The window is fetched newest-first for the cursor and then reversed, so `before` paging walks backwards through history without disturbing render order.

---

## 16. Crop health — `/crop-health`

Farmer-only (`roleGuard('farmer')`). All routes require a valid token.

| Method | Path | Success | Purpose |
|---|---|---|---|
| `POST` | `/crop-health/diagnose` | **200** | Diagnose a leaf photo |
| `GET` | `/crop-health/scans` | **200** | List my scans |
| `GET` | `/crop-health/scans/:id` | **200** | Read one scan |
| `PATCH` | `/crop-health/scans/:id/resolve` | **200** | Mark a scan resolved |

### 16.1 Diagnose

**Request** — `multipart/form-data`, not JSON.

| Part | Type | Required | Constraints |
|---|---|---|---|
| `image` | file | yes | JPEG, PNG or WebP; ≤ 5 MB |
| `cropName` | text | no | ≤ 100 chars; steers the model |

The image is persisted by the storage driver under `UPLOAD_DIR` (default `uploads/`) and served back at `UPLOAD_PUBLIC_PATH` (default `/uploads`). MongoDB stores only a content-addressed key — `scan-images/<sha256[0..40]><ext>`, saved as `imageProviderId` — plus the public URL in `imageUrl`. Identical bytes map to the same file, so re-uploading is a no-op.

Because the bytes behind a URL never change, scan images are served with `Cache-Control: public, max-age=2592000, immutable` and `Cross-Origin-Resource-Policy: cross-origin` (so a client on a different port can render them). No auth is required to read an image; the filename is an unguessable content hash. Swapping the local driver for S3/Cloudinary means replacing `saveScanImage` in [storage.service.ts](file:///d:/Agrimatch/backend/src/services/storage.service.ts) only.

**Response 200**

```json
{
  "success": true,
  "data": {
    "scanId": "6ad8e0...",
    "disease": "Early Blight",
    "confidence": 0.86,
    "severity": "moderate",
    "treatmentSteps": ["Remove affected lower leaves", "Apply a copper-based fungicide"],
    "preventionTips": ["Rotate away from solanaceous crops", "Mulch to stop soil splash"],
    "alternatives": [{ "disease": "Septoria Leaf Spot", "confidence": 0.31 }]
  }
}
```

`severity` is one of `low`, `moderate`, `severe`, `unknown` (default when the model does not state one).

**Low-confidence handling.** Below a confidence of **0.6** the response is *not* silently presented as a diagnosis: `disease` becomes `"uncertain"` and `alternatives` carries the ranked possibilities so the client can ask the farmer to confirm. `alternatives` is also populated for confident results.

**Errors**

| Status | Code | Cause |
|---|---|---|
| **400** | `VALIDATION_ERROR` | No `image` part in the request |
| **400** | `INVALID_FILE_TYPE` | The file is not JPEG/PNG/WebP |
| **413** | `FILE_TOO_LARGE` | The image exceeds 5 MB |
| **502** | `VISION_UNAVAILABLE` | The provider returned a non-2xx status or an unparseable payload |
| **503** | `PROVIDER_NOT_CONFIGURED` | `VISION_API_KEY` is unset or still a placeholder |
| **504** | `PROVIDER_TIMEOUT` | The provider did not answer within 8 s |

### 16.2 Scans

| Query param | Type | Notes |
|---|---|---|
| `limit` | 1–50 | Optional, defaults to 20 |
| `unresolvedOnly` | boolean | Optional; `true` returns only scans with no `resolvedAt` |

`GET /crop-health/scans` → **200** `data: { count, scans }`, newest first.

`GET /crop-health/scans/:id` → **200** `data: scan`; **404** `NOT_FOUND` when the scan is unknown *or* belongs to another farmer.

`PATCH /crop-health/scans/:id/resolve` → **200** `data: scan` + `message: "Scan marked resolved"`; **404** `SCAN_NOT_FOUND`.

---

## 17. Market prices — `/market-prices`

Requires a valid token.

**GET** `/api/v1/market-prices`

| Param | Required | Notes |
|---|---|---|
| `commodity` | yes | 2–60 chars. Matched exactly (case-insensitive) against the cached Agmarknet commodity name, e.g. `tomato`. |
| `district` | no | Partial, case-insensitive |
| `state` | no | Partial, case-insensitive |
| `days` | no | 1–30, default `7` — the trend/quote window |

**Response 200**

```json
{
  "success": true,
  "data": {
    "commodity": "tomato",
    "unit": "quintal",
    "source": "agmarknet",
    "cached": true,
    "fetchedAt": "2026-10-21T06:30:00.000Z",
    "mandis": [
      {
        "mandiName": "Nashik",
        "district": "Nashik",
        "state": "Maharashtra",
        "minPrice": 1200,
        "modalPrice": 1800,
        "maxPrice": 2300,
        "priceDate": "2026-10-20T00:00:00.000Z"
      }
    ],
    "trend": [{ "date": "2026-10-20", "modalPrice": 1800 }]
  }
}
```

Prices are **INR per quintal**, exactly as Agmarknet publishes them — no unit conversion is applied, and `unit` is always `"quintal"`.

- `source` is always present so the client can label the data.
- `cached: true` means the figures came from the local snapshot (either because it is younger than the 6-hour TTL, or because the provider failed and a stale snapshot was served instead of an error).
- `fetchedAt` is when the snapshot was pulled — render it so the farmer can judge freshness.
- **No `distanceKm` field.** Agmarknet supplies no coordinates for a mandi, so a distance could only be invented. Sort distance client-side only if the client already knows the farmer's location; otherwise sort by price.

**Errors**

| Status | Code | Cause |
|---|---|---|
| **400** | `VALIDATION_ERROR` | Missing `commodity`, or `days` outside 1–30 |
| **502** | `PROVIDER_UNAVAILABLE` | Agmarknet answered non-2xx and no cached rows exist |
| **503** | `PROVIDER_NOT_CONFIGURED` | `AGMARKNET_API_KEY` is unset or still a placeholder |
| **504** | `PROVIDER_TIMEOUT` | The provider did not answer within 8 s and no cache exists |

The snapshot is refreshed by a cron job daily at **06:30** (up to 10 previously-seen commodities), so a normal request is served from cache without touching the network.

---

## 18. Weather — `/weather`

Requires a valid token.

**GET** `/api/v1/weather`

| Param | Required | Notes |
|---|---|---|
| `district` | yes | 2–100 chars |
| `state` | yes | 2–100 chars — combined with `district` to geocode |

**Response 200**

```json
{
  "success": true,
  "data": {
    "district": "Nashik",
    "state": "Maharashtra",
    "current": { "tempC": 29.4, "humidity": 62, "windKph": 11, "condition": "Clouds" },
    "forecast": [{ "date": "2026-10-22", "tempMinC": 19, "tempMaxC": 31, "rainMm": 4.2, "humidity": 68 }],
    "advisories": [
      "Light rain expected — postpone spraying until the canopy dries.",
      "Good spray window on 2026-10-24: low wind and no rain."
    ],
    "source": "openweathermap",
    "cached": false,
    "fetchedAt": "2026-10-21T15:50:00.000Z"
  }
}
```

`advisories` is a deterministic, rule-based list built from the forecast (heavy/light rain, heat ≥ 38 °C, cold ≤ 8 °C, humidity ≥ 85 %, wind ≥ 25 kph, a good-spray window, a dry spell). It is capped at 6 entries and is never empty, so the client can always render an advisory card.

Same caching contract as §17: 3-hour TTL, `cached` flag, `fetchedAt`, and a stale snapshot is preferred over an error. Refreshed by cron every **3 hours** (up to 20 previously-seen locations).

**Errors**

| Status | Code | Cause |
|---|---|---|
| **400** | `VALIDATION_ERROR` | `district` or `state` missing/too short |
| **404** | `LOCATION_NOT_FOUND` | Geocoding could not resolve the district + state |
| **502** | `PROVIDER_UNAVAILABLE` | OpenWeatherMap answered non-2xx and no snapshot exists |
| **503** | `PROVIDER_NOT_CONFIGURED` | `WEATHER_API_KEY` is unset or still a placeholder |
| **504** | `PROVIDER_TIMEOUT` | The provider did not answer within 8 s and no snapshot exists |

---

## 19. Health and readiness

### 19.1 Health

**GET** `/api/v1/health` — **Public. Always 200**, even when MongoDB is down.

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-10-21T10:00:00.000Z",
    "db": "connected",
    "uptime": 123.45
  }
}
```

| Scenario | Status | `data.db` |
|---|---|---|
| Mongo connected | **200** | `"connected"` |
| Mongo disconnected | **200** | `"disconnected"` |

> Because this always returns 200, it cannot be used to alert on a dead database. Use `/ready` for that.

### 19.2 Ready

**GET** `/api/v1/ready` — **Public.** Use for load-balancer probes and monitoring.

| Scenario | Status | `data.status` |
|---|---|---|
| DB connected | **200** | `"ready"` |
| DB disconnected | **503** | `"db_unavailable"` |

---

## 20. Global and catch-all errors

| Condition | Status | Code / body |
|---|---|---|
| Unknown path under `/api/v1` | **404** | `NOT_FOUND` — `"Route not found"` |
| Registered path with an unregistered method (e.g. `PUT`) | **404** | Same catch-all (no 405 handler) |
| `/api` more than 100 requests / minute / IP | **429** | express-rate-limit default body |
| `/api/v1/auth` more than 30 requests / minute / IP | **429** | express-rate-limit default body |
| Unhandled exception | **500** | `INTERNAL_ERROR` |
| Unparseable JSON body | **400** | `INTERNAL_ERROR` from the body parser |
| Keys starting with `$` or containing `.` in the JSON body | — | Stripped by the sanitizer before handlers run |
| Body larger than 10 KB | **413** | Express default |

Response headers on rate-limited routes include `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and `RateLimit-Policy`.

---

## 21. Auth and ownership pipeline

```
Request
  → CORS / Helmet / body parser / mongo key sanitizer
  → global limiter (100/min on /api) and auth limiter (30/min on /api/v1/auth)
  → requireAuth           401 UNAUTHORIZED
  → roleGuard('farmer')   403 FORBIDDEN   (farmer-only routes)
  → validate(body|query|params)   400 VALIDATION_ERROR
  → controller
       → 404 NOT_FOUND
       → assertOwnership 403 FORBIDDEN
       → service         409 / 404 / 500
```

**Ownership:** the caller's `userId` must equal the resource owner field (`farmerId` for farm profiles and crop listings, `buyerId` for buyer requirements).

Newer resources invert the check instead of asserting it: `/orders` and `/crop-health/scans` filter by the caller in the query itself, so a foreign id produces **404** rather than **403**. That is deliberate — a 403 would confirm the record exists.

**Background jobs** (`node-cron`):

| Schedule | Job |
|---|---|
| Every 15 minutes | Expire stale crop listings, buyer requirements and match records |
| `30 6 * * *` (daily 06:30) | Refresh cached Agmarknet mandi prices (up to 10 commodities) |
| `0 */3 * * *` (every 3 hours) | Refresh cached weather snapshots (up to 20 locations) |

A failing refresh is logged and swallowed — it never takes down the process, and the last good snapshot keeps serving.

**External provider keys** (`env.ts`, all optional): `AGMARKNET_API_KEY`, `WEATHER_API_KEY`, `VISION_API_KEY`. When one is unset or left at its placeholder value, the matching module answers **503** `PROVIDER_NOT_CONFIGURED` instead of guessing — the app still boots and every other module works.

**OTP knobs** (`otp.service.ts`): 10-minute TTL, 5 verify attempts, 5 requests per phone per 60 minutes.

---

## 22. MCP tools

MCP is implemented in `backend/src/mcp.server.ts`. The HTTP process (`server.ts`) does **not** mount MCP on Express; tools are for an MCP host over stdio.

| Tool | Purpose |
|---|---|
| `health_check` | DB + uptime JSON |
| `crop_recommendation_quick` | Ranked crops from soil/season/budget |
| `farm_profile_summary` | Profile by `farmerId` |
| `marketplace_search` | Active, non-deleted listings (falls back to demo seed data if the DB is unreachable) |

---

## Appendix — client decision tree

```
200 / 201 → success (note: GET /farm-profiles/me may return data: null)
400 → VALIDATION_ERROR | INVALID_OTP | OTP_EXPIRED | LOCATION_REQUIRED | INVALID_FILE_TYPE
401 → UNAUTHORIZED | INVALID_CREDENTIALS | INVALID_REFRESH_TOKEN | REFRESH_REVOKED | INVALID_ACCOUNT
403 → ACCOUNT_DISABLED | FORBIDDEN | FARM_PROFILE_FORBIDDEN | CROP_LISTING_FORBIDDEN | BUYER_REQUIREMENT_FORBIDDEN
404 → NOT_FOUND | USER_NOT_FOUND | FARM_PROFILE_NOT_FOUND | CROP_LISTING_NOT_FOUND
      BUYER_REQUIREMENT_NOT_FOUND | MATCH_NOT_FOUND | PROFILE_NOT_FOUND | CROP_NOT_FOUND_IN_KB
      ORDER_NOT_FOUND | SCAN_NOT_FOUND | LOCATION_NOT_FOUND
409 → USER_EXISTS | FARM_PROFILE_EXISTS | MATCH_INVALID_STATE
      ORDER_ALREADY_EXISTS | ORDER_MATCH_NOT_ACCEPTED | ORDER_INVALID_STATE
      CANNOT_DISABLE_SELF (PATCH /users/:id/status on your own account)
413 → body too large | FILE_TOO_LARGE (image > 5 MB)
429 → RATE_LIMITED | OTP_ATTEMPTS_EXCEEDED | express-rate-limit
500 → OTP_SEND_FAILED | INTERNAL_ERROR (including malformed JSON)
502 → PROVIDER_UNAVAILABLE | VISION_UNAVAILABLE
503 → GET /ready when the DB is down, or PROVIDER_NOT_CONFIGURED (missing provider key)
504 → PROVIDER_TIMEOUT
```

The provider failures (502/503/504) are **not** client errors: retry later, and if a cached payload was returned instead you would have seen 200 with `cached: true`.
