<div align="center">

<img src="logo_readme.png" alt="Jin" width="120" />

# Jin

### The open standard that makes the web readable for AI agents.

[![AIP Version](https://img.shields.io/badge/AIP-v0.1%20Open%20Draft-6366f1?style=flat-square)](https://meetjin.com/spec)
[![npm](https://img.shields.io/npm/v/@papercargo/jin-cli?style=flat-square&color=6366f1)](https://www.npmjs.com/package/@papercargo/jin-cli)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-6366f1?style=flat-square)](LICENSE)
[![Spec License: CC0](https://img.shields.io/badge/Spec-CC0%20Public%20Domain-6366f1?style=flat-square)](LICENSE-SPEC)
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

## Get started in 3 minutes

```bash
# 1. Generate your intent map
npx @papercargo/jin-cli init

# 2. Review and add natural language descriptions
# Edit jin.json — fill in the triggers and descriptions

# 3. Validate
npx @papercargo/jin-cli validate

# 4. Publish to the registry
npx @papercargo/jin-cli publish
```

Your app is now discoverable by every AI agent in the world.

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
| `jin publish` | Deploy and register with meetjin.com |

### Framework support

| Framework | Status |
|-----------|--------|
| Next.js (App + Pages Router) | ✅ Supported |
| React Router (Vite) | ✅ Supported |
| Express | ✅ Supported |
| Supabase Edge Functions | ✅ Supported |
| FastAPI / Django | 🔄 Coming v0.2 |
| Rails | 🔄 Coming v0.2 |

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

## Roadmap

```
v0.1 (now)        Core spec, CLI, registry, explore page
v0.2 (Month 2)    @papercargo/jin-shield — scraper protection
                  Streaming intents, multi-step flows
                  FastAPI, Django, Rails scanners
v0.3 (Month 3)    Key Protocol — cryptographic agent sessions
                  Replay-proof session keys
                  Tamper-evident issuance log
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
