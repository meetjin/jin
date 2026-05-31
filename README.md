<div align="center">

<img src="logo_readme.png" alt="Jin" width="120" />

# Jin

### The open infrastructure standard for the agentic web. 
**A dual-sided protocol for machine-readable routing (`jin.json`) and zero-latency perimeter security.**

[![npm downloads](https://img.shields.io/npm/dw/@papercargo/jin-cli?style=flat-square&color=emerald)](https://www.npmjs.com/package/@papercargo/jin-cli)
[![AIP Version](https://img.shields.io/badge/AIP-v0.1%20Open%20Draft-6366f1?style=flat-square)](https://meetjin.com/spec)
[![npm](https://img.shields.io/npm/v/@papercargo/jin-cli?style=flat-square&color=6366f1)](https://www.npmjs.com/package/@papercargo/jin-cli)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-6366f1?style=flat-square)](LICENSE)
[![Registry](https://img.shields.io/badge/Registry-meetjin.com-6366f1?style=flat-square)](https://meetjin.com/registry)

**[Registry](https://meetjin.com/registry) · [Explore](https://meetjin.com/explore) · [Spec](https://meetjin.com/spec) · [Publish your app](https://meetjin.com)**

</div>

---

## The problem

Every website was built for human eyes — menus, buttons, pagination, login walls. AI agents trying to interact with them are forced to scrape HTML, simulate clicks, and break every time a class name changes.

There is no standard way for an app to say *"here is what I can do and how you can do it."*

Until now.

---

## What Jin does

Jin introduces the **Agent Intent Protocol (AIP)** — a lightweight open standard that gives any web application a machine-readable intent layer.

One JSON file. One well-known URL. Any agent can find your app, understand its capabilities, and execute actions without scraping a single pixel.

```
https://yourapp.com/.well-known/jin.json
```

This file — `jin.json` — is to AI agents what `sitemap.xml` is to search engines. It declares what your app can *do*, not just what pages it *has*.

---

## 🚀 New in v0.2.3

Version `0.2.3` is an all-inclusive framework and security update adding the **Jin Shield** cryptographic gateway boundary, support for ten major backend ecosystems, deep OpenAPI spec crawlers, and advanced parameter normalizations:

* **🛡️ Universal Jin Shield Security Perimeter**: Active gateway boundary protecting your endpoints against rogue scrapers. Auto-scans your workspace to generate zero-hop, in-memory RS256 token verification middlewares and guards for Express, Next.js, Hono, Fastify, NestJS, tRPC, FastAPI, Django, Flask, Laravel, and Rails.
* **10 New Framework Scanners**: Out-of-the-box static route extraction for **FastAPI**, **Django REST Framework**, **Flask**, **Laravel**, **Ruby on Rails**, **Fastify**, **Hono**, **NestJS**, **tRPC**, and **OpenAPI**.
* **Stateful Lexical Router Traversal**: Recursively traverses multi-level nested routers (like in tRPC) to generate unified dot-notation endpoint schemas (`/api/trpc/posts.create`).
* **Recursive Workspace OpenAPI Spec Discoverer**: Deep crawls your workspace recursively to automatically discover and import OpenAPI/Swagger configurations for any other backend stacks.
* **Advanced Parameter Normalization**: Automatically converts and maps complex path signatures (including typed path variables, catch-alls, regex filters, and optional parameters) to standard AIP-compliant formats.

---

## Get started in 3 minutes

```bash
# 1. Generate your intent map
npx @papercargo/jin-cli init

# 2. Review and add natural language descriptions
# Edit jin.json — fill in the triggers and descriptions

# 3. Validate
npx @papercargo/jin-cli validate

# 4. Activate the security shield
npx @papercargo/jin-cli shield

# 5. Publish to the registry
npx @papercargo/jin-cli publish
```

Your app is now cryptographically secured and discoverable by every compliant AI agent in the world.

---

## 🛡️ Jin Shield Security Perimeter

### The "Take It or Leave It" Boundary
Jin Shield flips the scraping paradigm by enforcing a strict protocol boundary before requests ever touch your controllers.

```text
[ Incoming Request ]
         │
         ▼
 ┌───────────────┐
 │  Jin Shield   │ ◄─── Cross-references JWKS public keys in-memory
 └───────┬───────┘
         │
         ├─► [ Verified Jin Agent ] ──► (200 OK) Native millisecond execution
         │
         └─► [ Unverified Scraper ] ──► (403 Forbidden) "Read jin.json or leave."
```
[Test A] Simulating Rogue Scraper hitting protected route...
✓ [Test A SUCCESS] Scraper blocked immediately by Jin Shield gateway boundary!

[Test B] Simulating verified Jin Agent with cryptographic passport...
✓ [Test B SUCCESS] Verified Jin Agent passed cryptographic check and accessed route!

Once you have declared your app capabilities, you can activate the **Jin Shield** trust perimeter to protect your backend gateway. It intercepts incoming traffic, verifies cryptographic agent passports, and blocks rogue, non-compliant scrapers while passing verified AI agents that match your local `jin.json` specification.

### Key Features:
* **🛡️ Decentralized IdP Pattern (Strictly Local Verification)**: The shield never makes database queries or external network hops to check a developer's API key. It strictly validates RS256 JWT agent passports locally in-memory using cached Public Keys.
* **🔑 In-Memory JWKS Caching & Automatic Key Rotation**: JWKS public keys are fetched from `meetjin.com` once on server boot and cached in-memory. If a key ID (`kid`) is not recognized in the local cache, the shield briefly re-fetches the JWKS keys automatically to handle rotated keys without downtime.
* **⚡ Cryptographically Hardened Engines**: Fully integrated with industry-standard, high-performance packages:
  * **TypeScript/Node**: Leverages `jsonwebtoken` for secure cryptographic checks.
  * **Python**: Uses `PyJWT` and `PyJWKClient` for automatic, highly optimized key caching and validation.
* **🎯 Exact Intent Routing**: Decodes agent identity tokens and asserts that the `intent_id` claim matches the requested path and method declared in your local `jin.json` route map.
* **12 Framework Adapters**: The CLI automatically scans your project and generates self-contained native adapters for:
  * **JavaScript/TypeScript**: Express, Next.js (App & Pages Routers), Hono, Fastify, NestJS Guards, and tRPC.
  * **Python**: FastAPI, Flask, and Django.
  * **Enterprise Blueprints**: PHP Laravel and Ruby on Rails.
* **📊 In-Memory Metrics**: Track active and total execution request counters with zero overhead.
* **🚪 Strict Fallback Boundary**: Short-circuits unauthorized agent hits or rogue scrapers with an HTTP `403 Forbidden` response immediately, pointing them to `/.well-known/jin.json` ("take it or leave it").

To activate the shield inside your codebase:
```bash
npx @papercargo/jin-cli shield
```
Follow the generated framework-specific setup logs to wire it up!

---

## What jin.json looks like

```json
{
  "aip_version": "0.1",
  "app": {
    "name": "My App",
    "description": "What my app does in plain language",
    "url": "https://myapp.com"
  },
  "auth": {
    "type": "bearer"
  },
  "intents": [
    {
      "id": "search_products",
      "name": "Search Products",
      "description": "Search for products by keyword or category",
      "triggers": [
        "find a product",
        "search for something to buy",
        "show me products",
        "I need to find X"
      ],
      "category": "commerce",
      "method": "GET",
      "endpoint": "/api/products",
      "parameters": {
        "query": {
          "type": "string",
          "description": "Search term",
          "required": true
        },
        "category": {
          "type": "string",
          "description": "Product category filter",
          "required": false
        }
      },
      "requires_auth": false,
      "destructive": false,
      "confirmation_required": false
    }
  ],
  "published": "2026-05-20T00:00:00Z"
}
```

---

## How agents use it

```javascript
// 1. Discover apps by intent
const results = await fetch(
  'https://meetjin.com/api/v1/registry/search?q=search+for+products'
)

// 2. Fetch the intent map
const intentMap = await fetch(
  'https://myapp.com/.well-known/jin.json'
).then(r => r.json())

// 3. Match user request to intent
const intent = intentMap.intents.find(i => i.id === 'search_products')

// 4. Execute
const response = await fetch(
  `${intentMap.app.url}${intent.endpoint}?query=laptop`,
  { headers: { Authorization: `Bearer ${token}` } }
)

// Done. No scraping. No brittle selectors.
// No Terms of Service violations.
```

---

## The registry

The **meetjin.com registry** is a public, searchable index of every app that has published a `jin.json`.

```bash
# Search by intent
GET https://meetjin.com/api/v1/registry/search?q=book+a+hotel

# List all apps
GET https://meetjin.com/api/v1/registry/apps

# Get app details + intents
GET https://meetjin.com/api/v1/registry/apps/:slug
```

No auth required. Any agent can query it.

**[Browse the registry →](https://meetjin.com/registry)**

---

## Try it live

Test 20 real APIs with their AIP intent maps at **[meetjin.com/explore](https://meetjin.com/explore)**

```
🌤 Open-Meteo      Live weather data — no key required
🚀 NASA APOD       Astronomy picture of the day
⚡ PokeAPI         Pokémon data
🧪 JSONPlaceholder Fake REST API for testing
🌍 REST Countries  Country data and statistics
₿  CoinDesk        Live Bitcoin price
🍽 TheMealDB       Recipe search
+ 13 more
```

---

## CLI reference

| Command | Description |
|---------|-------------|
| `jin init` | Scan codebase, generate `jin.json` scaffold |
| `jin validate` | Validate against AIP spec |
| `jin serve` | Serve locally at `/.well-known/jin.json` |
| `jin shield` | Activate the universal Jin Shield security perimeter |
| `jin publish` | Deploy and register with meetjin.com |

### Framework support

| Framework | Status | Notes |
|-----------|--------|-------|
| Next.js (App + Pages Router) | ✅ Supported | Full dynamic route normalization |
| React Router (Vite) | ✅ Supported | Client-side routing extraction |
| Express | ✅ Supported | Verb and route matcher extraction |
| Supabase Edge Functions | ✅ Supported | Edge-native handler scanning |
| FastAPI (Python) | ✅ Supported | Normalizes typed parameters & catch-alls |
| Django REST Framework | ✅ Supported | URL paths, `re_path` regexes, and ViewSet routers |
| Flask (Python) | ✅ Supported | Supports methods lists & verb shortcuts |
| Laravel (PHP) | ✅ Supported | Direct web/api PHP routes and optional arguments |
| Ruby on Rails | ✅ Supported | Direct endpoints & resources macros |
| Fastify (Node) | ✅ Supported | Verbs and explicit `.route` object configuration blocks |
| Hono (Edge/TS) | ✅ Supported | Removes inline parameter constraint filters |
| NestJS (Enterprise) | ✅ Supported | Class prefix + method decorators matching |
| tRPC (TS-Native) | ✅ Supported | Recursive nested router traversal |
| OpenAPI/Swagger | ✅ Supported | **Recursive spec finder** covering other architectures |

---

## Category taxonomy

Intent categories for registry discovery:

| Category | Description |
|----------|-------------|
| `commerce` | Buying, selling, inventory |
| `travel` | Booking, itineraries, transport |
| `productivity` | Calendar, tasks, notes |
| `communication` | Email, messaging, notifications |
| `finance` | Payments, accounts, invoices |
| `identity` | Auth, profiles, verification |
| `healthcare` | Appointments, records |
| `legal` | Contracts, compliance, documents |
| `government` | Applications, permits, filings |
| `education` | Courses, content, progress |
| `media` | Search, playback, recommendations |
| `developer` | APIs, code, deployments |
| `data` | Search, query, analytics |
| `social` | Profiles, posts, feeds |
| `local` | Businesses, locations, reviews |

---

## The spec

The **Agent Intent Protocol** specification is licensed **CC0 — public domain**.

No permission needed. No attribution required. Implement it, fork it, build on it.

**[Read the full spec →](https://meetjin.com/spec)**

The spec covers:
- `jin.json` schema and field definitions
- Discovery URL convention (`/.well-known/jin.json`)
- Authentication patterns
- Intent categories and taxonomy
- Versioning and evolution
- Security considerations
- Agent integration guide

---

## Why AIP instead of OpenAPI?

| | OpenAPI | AIP |
|---|---------|-----|
| Designed for | Human developers reading docs | AI agents executing tasks |
| Discovery | Manual, no standard URL | `/.well-known/jin.json` — universal |
| Natural language | ❌ | ✅ Triggers for intent matching |
| Registry | ❌ | ✅ meetjin.com — searchable |
| Setup time | Hours | Minutes |
| Agent-optimised | ❌ | ✅ |

AIP is not a replacement for OpenAPI. It is a companion standard — optimised for machine consumption, natural language matching, and agent discovery.

---

## The Sovereign Agentic Economy (Why we are building this)

Jin is designed to replace hostile, brute-force web scraping platforms with a cooperative, high-speed economic standard.

1. **Webmaster Sovereignty:** For years, websites have been forced to fight AI scrapers draining their servers. Jin gives webmasters their power back. With `jin shield`, you dictate exactly what AI agents can see and do. If it isn't in your `jin.json`, it doesn't exist to the bot.
2. **Agentic Determinism:** LLMs naturally prefer the path of least compute. By providing a clean `jin.json` map, AI swarms bypass heavy, hallucination-prone DOM scraping and execute deterministic API calls in milliseconds.
3. **Layer 4 Settlement (Upcoming):** Jin is laying the groundwork for decentralized API monetization. Soon, webmasters will be able to gate premium endpoints in their `jin.json`, allowing verified agents to natively pay micro-transactions for data access. No middlemen, no expensive scraping platform subscriptions—just direct machine-to-machine commerce.

## Roadmap

```
v0.1              Core spec, CLI, registry, explore page
v0.2              Next-Gen backend framework support (10+ scanners)
                  Recursive workspace OpenAPI spec discoverer
v0.2.3 (now)      @papercargo/jin-shield — scraper protection (asymmetric RS256 JWT, zero-hop)
v0.3 (Month 3)    Streaming intents, multi-step flows
                  Key Protocol — cryptographic agent sessions
v1.0 (2027)       Stable spec — no breaking changes
                  AIP working group formally established
                  Standards body submission
```

---

## Contributing

AIP gets better with more implementors. There are three ways to contribute:

**1. Publish your app**
Run `npx @papercargo/jin-cli init` and publish to the registry. Every listing makes the standard more valuable.

**2. Contribute community intent maps**
Write intent maps for apps that haven't adopted AIP natively. Browse examples at [meetjin.com/explore](https://meetjin.com/explore) and submit via PR.

**3. Improve the spec**
Open an issue describing the problem and proposed change. The spec evolves through community discussion.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## Self-hosting

The registry is open source. Run your own internal registry for private apps:

```bash
git clone https://github.com/YOUR_HANDLE/meetjin
cd meetjin
pnpm install
cp .env.example .env  # add your Supabase credentials
pnpm dev
```

---

## Built by

Jin is a project by **[Papercargo](https://papercargo.com)** — building infrastructure for the agentic web.

---

## License

| Component | License |
|-----------|---------|
| AIP Specification | [CC0 1.0 Universal](LICENSE-SPEC) — Public Domain |
| `@papercargo/jin-cli` | [Apache 2.0](LICENSE) |
| Registry (meetjin.com) | [Apache 2.0](LICENSE) |

The specification is public domain. The tooling is Apache 2.0.
Build whatever you want on top of both.

---

<div align="center">

**[meetjin.com](https://meetjin.com) · [Registry](https://meetjin.com/registry) · [Explore](https://meetjin.com/explore) · [Spec](https://meetjin.com/spec)**

*The agentic web needs a foundation. This is it.*

</div>
