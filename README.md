<div align="center">

<img src="logo Jin.png" alt="Jin" width="120" />

# Jin

### Machine-readable API mapping (`jin.json`) and zero-latency gateway security for AI agents.

[![npm downloads](https://img.shields.io/npm/dt/@papercargo/jin-cli?style=flat-square&color=emerald)](https://www.npmjs.com/package/@papercargo/jin-cli)
[![AIP Version](https://img.shields.io/badge/AIP-v0.1%20Open%20Draft-6366f1?style=flat-square)](https://meetjin.com/spec)
[![npm](https://img.shields.io/npm/v/@papercargo/jin-cli?style=flat-square&color=6366f1)](https://www.npmjs.com/package/@papercargo/jin-cli)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-6366f1?style=flat-square)](LICENSE)
[![Registry](https://img.shields.io/badge/Registry-meetjin.com-6366f1?style=flat-square)](https://meetjin.com/registry)

**[Registry](https://meetjin.com/registry) · [Explore](https://meetjin.com/explore) · [Spec](https://meetjin.com/spec) · [Publish your app](https://meetjin.com)**

</div>

---

## What is Jin?

Jin is a standard and tooling layer for connecting web applications to AI agents. It consists of two parts:

1. **Agent Intent Protocol (AIP)**: An open standard (`jin.json` hosted at `/.well-known/jin.json`) that maps your application's endpoints to natural language triggers, categories, and schemas. It serves as a machine-readable directory (`sitemap.xml`) for agents to find, understand, and execute actions on your API without fragile web scraping.
2. **Jin Shield**: A lightweight, zero-latency security gateway middleware. It intercepts agent traffic and validates asymmetric cryptographic passports (issued by the registry) locally in-memory, blocking unauthorized scrapers and malformed requests before they hit your application logic.

---

## 🚀 New in v0.2.6

Version `0.2.6` introduces monorepo support, microservice aggregation, and interactive options:

* **📦 Monorepo Workspace Auto-Discovery**: Automatically detects NPM, Yarn, or PNPM workspaces and queries subfolders to locate target applications (Next.js, Express, Hono, FastAPI, etc.).
* **🔀 In-Memory Microservice API Gateway Aggregation**: Loop through your workspaces, specify custom gateway routing prefixes (e.g., `/api/auth`, `/web-app`), and merge all discovered intents into a single, unified root `jin.json` config in memory.
* **💬 Interactive Prompt Flow**: Upgraded the initialization experience using `@inquirer/prompts` to guide you through project targeting and routing prefix setups.
* **📂 Command Directory Scoping**: All commands (`init`, `validate`, `serve`, `publish`, `watch`, `shield`) now support passing an optional path argument (e.g., `npx @papercargo/jin-cli validate apps/web`) to explicitly scope operations.
* **🛡️ Production-Ready JinShield Class**: Active gateway boundary protecting your endpoints. Provides cached, in-memory RS256 token verification, payload size boundary checks, and asynchronous threat reporting.
* **🔑 Zero-Hop Asymmetric Verification**: Utilizes local public key caching to guarantee zero external network hops on active request evaluations.
* **12 Framework Scanners**: Out-of-the-box static route extraction for **Next.js**, **Express**, **FastAPI**, **Django REST Framework**, **Flask**, **Laravel**, **Ruby on Rails**, **Fastify**, **Hono**, **NestJS**, **tRPC**, and **OpenAPI**.

---

## The Problem

Websites and APIs are designed for human consumption or developer integrations. When an AI agent tries to interact with a web page, it is forced to scrape HTML, parse DOM trees, and simulate button clicks. This process is:
* **Fragile**: Any UI or CSS class change breaks the agent's scripts.
* **Expensive**: LLMs waste thousands of context tokens reading unformatted HTML and boilerplate page assets.
* **Taxing**: High-frequency web scraping puts heavy load on web servers.

Jin solves this by providing a clean, machine-readable definition of what your application can do, how parameters should be passed, and what natural language queries map to those actions.

---

## Get Started in 3 Minutes

### 1. Initialize the Intent Map
Run the init command inside your project directory. The CLI will scan your codebase, identify your routes/endpoints (supporting Next.js, Express, FastAPI, Django, Laravel, and more), and generate a `jin.json` scaffold:
```bash
npx @papercargo/jin-cli init
```

### 2. Review Triggers & Descriptions
Open the generated `jin.json` file. Fill in descriptions and natural language trigger phrases for the endpoints you want agents to discover:
```json
"triggers": [
  "find a product",
  "search for items in store",
  "I want to buy something"
]
```

### 3. Validate Against Spec
Verify that your file conforms to the AIP JSON schema specification:
```bash
npx @papercargo/jin-cli validate
```

### 4. Deploy and Publish
Publish the intent map to the public registry. This enables compliant agents to discover your API's capabilities dynamically:
```bash
npx @papercargo/jin-cli publish
```

---

## 🛡️ Jin Shield Security Perimeter

Once you declare your API capabilities, you can activate the **Jin Shield** trust perimeter to protect your backend endpoints. It checks incoming traffic, validates agent identity tokens, and blocks unverified crawlers or rogue scrapers with an HTTP `403 Forbidden` response.

```text
[ Incoming Request ]
         │
         ▼
 ┌───────────────┐
 │  Jin Shield   │ ◄─── Validates JWT against cached JWKS keys in-memory
 └───────┬───────┘
         │
         ├─► [ Verified Agent ]   ──► (200 OK) Native Execution
         │
         └─► [ Rogue Scraper ]    ──► (403 Forbidden) "Access Denied. Refer to jin.json"
```

### Working Principles & Security Architecture

* **Strictly Local In-Memory Verification**: The middleware performs cryptographic RS256 signature verification of the `Jin-Identity` authorization token locally. It does not query external databases or make third-party API calls during request processing, maintaining sub-millisecond overhead.
* **No Telemetry / No "Calling Home"**: The middleware does not transmit request details, IP addresses, or agent metadata back to `meetjin.com` or any centralized server during verification.
* **JWKS Key Caching**: Public verification keys are retrieved from `meetjin.com` (or your configured custom registry) once at server startup. If a token arrives with an unrecognized Key ID (`kid`) due to key rotation, the shield invalidates the local cache and fetches the updated JWKS keys exactly once to prevent downtime.
* **Async Threat Monitoring Callback**: You can supply an `onThreatDetected` callback. When an invalid signature, payload boundary violation, or mismatched intent is detected, the shield reports a `ThreatIntel` log asynchronously out-of-band, allowing you to log details or feed them to your log aggregator without impacting response latencies.

### Setup Examples

#### Node (Express)
```typescript
import express from 'express';
import { expressAdapter } from '@papercargo/jin-cli/dist/crypto/jin_core';

const app = express();

// Protects all endpoints listed in your jin.json automatically
app.use(expressAdapter({
  cwd: process.cwd()
}));

app.get('/api/products', (req, res) => {
  res.json({ message: "Access granted to verified agent." });
});

app.listen(3000);
```

#### Python (FastAPI)
```python
from fastapi import FastAPI
from jin_core import JinShieldMiddleware

app = FastAPI()

# Mount the ASGI middleware to protect declared routes
app.add_middleware(
    JinShieldMiddleware,
    cwd="."
)

@app.get("/api/products")
def search_products(query: str):
    return {"message": f"Results for: {query}"}
```

---

## What `jin.json` Looks Like

```json
{
  "aip_version": "0.1",
  "app": {
    "name": "E-Commerce API",
    "description": "API for product lookup and checkout flow",
    "url": "https://api.example.com"
  },
  "auth": {
    "type": "bearer"
  },
  "intents": [
    {
      "id": "search_products",
      "name": "Search Products",
      "description": "Lookup products by text query and category filters",
      "triggers": [
        "find a product",
        "search for something to buy",
        "show me products"
      ],
      "category": "commerce",
      "method": "GET",
      "endpoint": "/api/products",
      "parameters": {
        "query": {
          "type": "string",
          "description": "Keyword search term",
          "required": true
        },
        "category": {
          "type": "string",
          "description": "Optional category filter",
          "required": false
        }
      },
      "requires_auth": false,
      "destructive": false,
      "confirmation_required": false
    }
  ],
  "published": "2026-06-03T10:00:00Z"
}
```

---

## How Agents Use It

Compliant agents query the registry dynamically or fetch your well-known manifest directly to resolve execution parameters:

```javascript
// 1. Discover app endpoints by matching natural language intent
const results = await fetch(
  'https://meetjin.com/api/v1/registry/search?q=search+for+products'
).then(r => r.json());

// 2. Fetch the target application's intent map
const intentMap = await fetch(
  'https://api.example.com/.well-known/jin.json'
).then(r => r.json());

// 3. Select the matching intent from the intents array
const intent = intentMap.intents.find(i => i.id === 'search_products');

// 4. Execute the call directly using standard schema parameter resolution
const response = await fetch(
  `${intentMap.app.url}${intent.endpoint}?query=laptop`,
  { 
    headers: { 
      'Authorization': `Bearer ${token}` 
    } 
  }
).then(r => r.json());
```

---

## Why AIP instead of OpenAPI?

| Feature | OpenAPI | AIP |
| :--- | :--- | :--- |
| **Primary Audience** | Human developers reading docs | AI agents executing tasks |
| **Discovery Path** | Manual, undocumented URLs | Standardized `/.well-known/jin.json` URL |
| **Matching Logic** | Path-based routing / HTTP verbs | Semantic natural language `triggers` |
| **Registry Integration** | Not natively supported | Searchable index out-of-the-box (`meetjin.com`) |
| **Setup Time** | Hours to configure and generate | Minutes via automatic codebase scanners |
| **Security Layer** | Relies on manual key creation | Standardized asymmetric agent passport checks |

AIP is designed as a companion standard alongside OpenAPI. It simplifies API capabilities down to intent models that LLM agents can easily map to natural language queries.

---

## CLI Command Reference

| Command | Description |
| :--- | :--- |
| `jin init [dir]` | Scans the target/local directory, detects framework type, and generates the `jin.json` scaffold |
| `jin validate [dir]` | Validates the target `jin.json` configuration against the AIP spec schema |
| `jin serve [dir]` | Spins up a local server hosting the `jin.json` file at `/.well-known/jin.json` for testing |
| `jin watch [dir]` | Watches your target codebase files and updates/re-validates `jin.json` automatically |
| `jin shield [dir]` | Scans your codebase and generates native middleware files to enforce security limits |
| `jin publish [dir]` | Registers your verified `jin.json` map with the central index at `meetjin.com` |

---

## Codebase Framework Scanners

The CLI checks project imports and structure to extract routes and convert parameters for:

* **Next.js**: Full support for App Router & Pages Router API routes.
* **Express**: Extracts route patterns and HTTP verbs.
* **React Router (Vite)**: Parses client-side routing definitions.
* **Hono**: Normalizes inline edge route parameters.
* **Fastify**: Reads route config objects and parameters.
* **NestJS**: Matches controller class prefixes with decorator routes.
* **tRPC**: Recursively crawls router hierarchies to map dot-notation endpoints.
* **FastAPI (Python)**: Maps typed parameters, defaults, and type constraints.
* **Flask (Python)**: Resolves route rules and HTTP method matrices.
* **Django REST Framework**: Extracts ViewSets, Routers, and regular path variables.
* **Laravel (PHP)**: Parses web/api routes and path structures.
* **Ruby on Rails**: Translates controller routes and Rails macro endpoints.
* **Supabase Edge Functions**: Extracts routing paths from edge handlers.
* **OpenAPI Specs**: Recursively discovers `openapi.json` / `swagger.yaml` specs and converts them to AIP format.

---

## Registry Discovery Taxonomy

Categorize your intent maps under these standard keys to help agents filter capabilities:

| Category | Typical Capabilities |
| :--- | :--- |
| `commerce` | Store inventory, buying, selling, cart management |
| `travel` | Transport, hotel booking, itineraries |
| `productivity` | Tasks, calendars, note taking, project boards |
| `communication` | Emails, notifications, messaging boards |
| `finance` | Payments, invoices, statements |
| `identity` | Profile verification, user authentication |
| `developer` | API management, deployment logs, coding services |
| `data` | Analytics, custom query endpoints, reporting data |
| `social` | User feeds, profiles, posting assets |
| `local` | Locations, restaurant reviews, shop details |

---

## Contributing & Self-Hosting

### Contributing
The AIP specification is fully open. You can contribute in three ways:
1. **Publish Intent Maps**: Run `npx @papercargo/jin-cli init` on your public apps and add them to the directory.
2. **Contribute Community Maps**: Write and submit intent maps for public services that do not yet natively support AIP.
3. **Enhance the Spec**: Open issues or PRs to discuss protocol changes.

### Self-Hosting the Registry
The registry server is fully open-source. To host your own private registry for internal enterprise agents:
```bash
git clone https://github.com/meetjin/meetjin
cd meetjin
pnpm install
cp .env.example .env # Provide your database credentials
pnpm dev
```

---

## Spec & License Info

The Agent Intent Protocol specification is licensed under the public domain (**CC0 1.0 Universal**). You can fork, adapt, or build on it without permission or attribution requirements.

| Component | License |
| :--- | :--- |
| AIP Specification | [CC0 1.0 Universal](LICENSE-SPEC) (Public Domain) |
| `@papercargo/jin-cli` | [Apache License 2.0](LICENSE) |
| Registry Database/Site | [Apache License 2.0](LICENSE) |

---

<div align="center">

**[meetjin.com](https://meetjin.com) · [Registry](https://meetjin.com/registry) · [Explore](https://meetjin.com/explore) · [Spec](https://meetjin.com/spec)**

*The agentic web needs a foundation. This is it.*

</div>
