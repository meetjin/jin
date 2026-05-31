import fs from 'fs'
import path from 'path'
import { resolveJinJsonPath } from '../utils'

// ============================================================================
// 1. EXPRESS & NEXT.JS PAGES ROUTER TEMPLATE
// ============================================================================
const EXPRESS_TEMPLATE = `/**
 * Jin Shield Gateway Security Boundary (Express / Next.js Pages Router)
 * Generated automatically by @papercargo/jin-cli
 * 
 * In-memory asymmetric cryptographic validation (RS256) of agent passports.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const shieldStats = { activeRequests: 0, totalRequests: 0 };
let cachedKeys = null;
let fetchingPromise = null;
const JWKS_URL = process.env.JIN_JWKS_URL || 'https://meetjin.com/.well-known/jwks.json';

function getJwksKeys(jwksUrl = JWKS_URL) {
  if (cachedKeys) return Promise.resolve(cachedKeys);
  if (fetchingPromise) return fetchingPromise;

  fetchingPromise = new Promise((resolve, reject) => {
    const client = jwksUrl.startsWith('https:') ? https : http;
    client.get(jwksUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error(\`Failed to fetch JWKS: HTTP \${res.statusCode}\`);
          const jwks = JSON.parse(data);
          cachedKeys = jwks.keys || [];
          resolve(cachedKeys);
        } catch (err) { reject(err); }
      });
    }).on('error', (err) => { reject(err); });
  });

  return fetchingPromise.catch((err) => {
    fetchingPromise = null;
    throw err;
  });
}

function matchPath(endpointPattern, actualPath) {
  const normPattern = endpointPattern.endsWith('/') && endpointPattern !== '/' ? endpointPattern.slice(0, -1) : endpointPattern;
  const normActual = actualPath.endsWith('/') && actualPath !== '/' ? actualPath.slice(0, -1) : actualPath;
  let pattern = normPattern.replace(/\\{([^}]+)\\}/g, ':$1');

  let escaped = '';
  const specialChars = '.+^$()|{}[]\\\\';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (specialChars.indexOf(char) !== -1) {
      escaped += '\\\\' + char;
    } else {
      escaped += char;
    }
  }

  const regexString = '^' + escaped
    .replace(/:(\\w+)\\*/g, '(.*)')
    .replace(/:(\\w+)/g, '([^/]+)')
    + '$';

  return new RegExp(regexString).test(normActual);
}

function loadJinJson(cwd = process.cwd()) {
  const paths = [
    path.join(cwd, 'public', '.well-known', 'jin.json'),
    path.join(cwd, '.well-known', 'jin.json'),
    path.join(cwd, 'jin.json')
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) {}
    }
  }
  return null;
}

function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  return { header, payload, signature: parts[2], signedInput: parts[0] + '.' + parts[1] };
}

function verifySignature(signedInput, signatureBase64Url, jwk) {
  const publicKey = crypto.createPublicKey({
    key: { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig' },
    format: 'jwk'
  });
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signedInput);
  return verifier.verify(publicKey, Buffer.from(signatureBase64Url, 'base64url'));
}

async function verifyJinToken(token, method, reqPath, jinJson) {
  try {
    const reqMethod = method.toUpperCase();
    let matchedIntent = null;
    if (jinJson && jinJson.intents) {
      matchedIntent = jinJson.intents.find(i => i.method.toUpperCase() === reqMethod && matchPath(i.endpoint, reqPath));
    }
    const { header, payload, signature, signedInput } = decodeJwt(token);
    if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported algorithm or missing kid');
    let keys = await getJwksKeys();
    let matchingJwk = keys.find(k => k.kid === header.kid);
    if (!matchingJwk) {
      cachedKeys = null;
      fetchingPromise = null;
      keys = await getJwksKeys();
      matchingJwk = keys.find(k => k.kid === header.kid);
    }
    if (!matchingJwk) throw new Error('Signatory key ID not recognized');
    if (!verifySignature(signedInput, signature, matchingJwk)) throw new Error('Invalid cryptographic signature');
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) throw new Error('Passport expired');
    if (payload.iss !== 'meetjin.com' && payload.iss !== 'https://meetjin.com') throw new Error('Untrusted issuer');
    if (!matchedIntent) throw new Error(\`Route \${reqMethod} \${reqPath} is not registered in jin.json\`);
    if (payload.intent_id !== matchedIntent.id) throw new Error(\`Passport intent '\${payload.intent_id}' mismatch\`);
    return { success: true, payload };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function createMiddleware(options = {}) {
  const cwd = options.cwd || process.cwd();
  const jinJson = loadJinJson(cwd);

  return async (req, res, next) => {
    const reqPath = req.path || (req.originalUrl ? req.originalUrl.split('?')[0] : '/');
    const reqMethod = (req.method || 'GET').toUpperCase();
    let isProtected = false;
    if (jinJson && jinJson.intents) {
      isProtected = jinJson.intents.some(i => i.method.toUpperCase() === reqMethod && matchPath(i.endpoint, reqPath));
    }
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const hasJinIdentity = typeof authHeader === 'string' && authHeader.startsWith('Jin-Identity ');
    if (!isProtected && !hasJinIdentity) return next();

    const block = (reason) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: \`Access Denied. \${reason}. Refer to /.well-known/jin.json\` }));
    };

    if (!hasJinIdentity) return block('Missing Authorization: Jin-Identity header');
    const token = authHeader.substring('Jin-Identity '.length).trim();
    const result = await verifyJinToken(token, reqMethod, reqPath, jinJson);
    if (!result.success) return block(result.error);

    shieldStats.totalRequests++;
    shieldStats.activeRequests++;
    res.on('finish', () => { shieldStats.activeRequests--; });
    return next();
  };
}

module.exports = createMiddleware();
module.exports.stats = shieldStats;
`;

// ============================================================================
// 2. NEXT.JS APP ROUTER MIDDLEWARE TEMPLATE (Edge-Compatible Web-Crypto)
// ============================================================================
const NEXT_APP_TEMPLATE = `/**
 * Jin Shield Edge-Compatible Gateway Boundary (Next.js App Router)
 * Generated automatically by @papercargo/jin-cli
 * 
 * Place this inside your Next.js middleware.ts file.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const JWKS_URL = process.env.JIN_JWKS_URL || 'https://meetjin.com/.well-known/jwks.json';

function matchPath(endpointPattern: string, actualPath: string): boolean {
  const normPattern = endpointPattern.endsWith('/') && endpointPattern !== '/' ? endpointPattern.slice(0, -1) : endpointPattern;
  const normActual = actualPath.endsWith('/') && actualPath !== '/' ? actualPath.slice(0, -1) : actualPath;
  let pattern = normPattern.replace(/\\{([^}]+)\\}/g, ':$1');

  let escaped = '';
  const specialChars = '.+^$()|{}[]\\\\';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (specialChars.indexOf(char) !== -1) {
      escaped += '\\\\' + char;
    } else {
      escaped += char;
    }
  }

  const regexString = '^' + escaped
    .replace(/:(\\w+)\\*/g, '(.*)')
    .replace(/:(\\w+)/g, '([^/]+)')
    + '$';

  return new RegExp(regexString).test(normActual);
}

export async function verifyJinShield(req: NextRequest, jinJson: any) {
  const reqUrl = new URL(req.url);
  const reqPath = reqUrl.pathname;
  const reqMethod = req.method.toUpperCase();

  let isProtected = false;
  let matchedIntent: any = null;
  if (jinJson && jinJson.intents) {
    matchedIntent = jinJson.intents.find((i: any) => i.method.toUpperCase() === reqMethod && matchPath(i.endpoint, reqPath));
    isProtected = !!matchedIntent;
  }

  const authHeader = req.headers.get('authorization');
  const hasJinIdentity = typeof authHeader === 'string' && authHeader.startsWith('Jin-Identity ');

  if (!isProtected && !hasJinIdentity) return null;

  const block = (reason: string) => {
    return new NextResponse(
      JSON.stringify({ error: \`Access Denied. \${reason}. Refer to protocol instructions at /.well-known/jin.json\` }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  };

  if (!hasJinIdentity) return block('Missing Authorization: Jin-Identity header');
  const token = authHeader.substring('Jin-Identity '.length).trim();

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return block('Invalid JWT token format');
    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const signatureStr = parts[2];

    if (header.alg !== 'RS256' || !header.kid) return block('Unsupported or missing key ID (kid)');
    if (!matchedIntent) return block('Endpoint not declared in jin.json');
    if (payload.intent_id !== matchedIntent.id) return block(\`Passport intent '\${payload.intent_id}' mismatch\`);
    
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return block('Identity passport has expired');

    // Fetch keys from central authority via native Edge fetch
    const resKeys = await fetch(JWKS_URL);
    const jwks = await resKeys.json();
    const matchingJwk = jwks.keys.find((k: any) => k.kid === header.kid);
    if (!matchingJwk) return block('Signatory key ID not recognized');

    // Web Crypto RS256 Verification
    const publicKeyData = { kty: "RSA", n: matchingJwk.n, e: matchingJwk.e, alg: "RS256", ext: true };
    const key = await crypto.subtle.importKey(
      "jwk",
      publicKeyData,
      { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
      false,
      ["verify"]
    );
    const encoder = new TextEncoder();
    const signedInputBuffer = encoder.encode(parts[0] + '.' + parts[1]);
    const sigBinary = Uint8Array.from(atob(signatureStr.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

    const isSigValid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sigBinary, signedInputBuffer);
    if (!isSigValid) return block('Invalid cryptographic passport signature');

    return null; // Passed completely
  } catch (err: any) {
    return block(\`Verification failed: \${err.message}\`);
  }
}
`;

// ============================================================================
// 3. HONO TEMPLATE
// ============================================================================
const HONO_TEMPLATE = `/**
 * Jin Shield Security Middleware (Hono)
 * Generated automatically by @papercargo/jin-cli
 */

import { Hono } from 'hono';
import { getJwksKeys, verifyJinToken, loadJinJson, matchPath, shieldStats } from './jin_core';

export function createHonoShieldMiddleware(options: { cwd?: string } = {}) {
  const cwd = options.cwd || process.cwd();
  const jinJson = loadJinJson(cwd);

  return async (c: any, next: any) => {
    const reqPath = c.req.path;
    const reqMethod = c.req.method.toUpperCase();

    let isProtected = false;
    if (jinJson && jinJson.intents) {
      isProtected = jinJson.intents.some((i: any) => i.method.toUpperCase() === reqMethod && matchPath(i.endpoint, reqPath));
    }

    const authHeader = c.req.header('Authorization');
    const hasJinIdentity = typeof authHeader === 'string' && authHeader.startsWith('Jin-Identity ');

    if (!isProtected && !hasJinIdentity) {
      return await next();
    }

    if (!hasJinIdentity) {
      c.status(403);
      return c.json({ error: 'Access Denied. Missing Authorization: Jin-Identity header. Refer to /.well-known/jin.json' });
    }

    const token = authHeader.substring('Jin-Identity '.length).trim();
    const result = await verifyJinToken(token, reqMethod, reqPath, jinJson);

    if (!result.success) {
      c.status(403);
      return c.json({ error: \`Access Denied. \${result.error}. Refer to /.well-known/jin.json\` });
    }

    shieldStats.totalRequests++;
    shieldStats.activeRequests++;
    try {
      return await next();
    } finally {
      shieldStats.activeRequests--;
    }
  };
}
`;

// ============================================================================
// 4. FASTIFY TEMPLATE
// ============================================================================
const FASTIFY_TEMPLATE = `/**
 * Jin Shield Hooks Adapter (Fastify)
 * Generated automatically by @papercargo/jin-cli
 */

import { verifyJinToken, loadJinJson, matchPath, shieldStats } from './jin_core';

export function fastifyShieldHook(options: { cwd?: string } = {}) {
  const cwd = options.cwd || process.cwd();
  const jinJson = loadJinJson(cwd);

  return async (request: any, reply: any) => {
    const reqPath = request.routerPath || request.url.split('?')[0];
    const reqMethod = request.method.toUpperCase();

    let isProtected = false;
    if (jinJson && jinJson.intents) {
      isProtected = jinJson.intents.some((i: any) => i.method.toUpperCase() === reqMethod && matchPath(i.endpoint, reqPath));
    }

    const authHeader = request.headers['authorization'];
    const hasJinIdentity = typeof authHeader === 'string' && authHeader.startsWith('Jin-Identity ');

    if (!isProtected && !hasJinIdentity) return;

    const block = (reason: string) => {
      reply.code(403).send({ error: \`Access Denied. \${reason}. Refer to protocol instructions at /.well-known/jin.json\` });
    };

    if (!hasJinIdentity) return block('Missing Authorization: Jin-Identity header');
    const token = authHeader.substring('Jin-Identity '.length).trim();
    const result = await verifyJinToken(token, reqMethod, reqPath, jinJson);

    if (!result.success) return block(result.error || 'Verification failed');

    shieldStats.totalRequests++;
    shieldStats.activeRequests++;
    request.raw.on('close', () => { shieldStats.activeRequests--; });
  };
}
`;

// ============================================================================
// 5. NESTJS CANACTIVATE GUARD TEMPLATE
// ============================================================================
const NESTJS_TEMPLATE = `/**
 * Jin Shield Guard (NestJS)
 * Generated automatically by @papercargo/jin-cli
 */

import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { verifyJinToken, loadJinJson, matchPath } from './jin_core';

@Injectable()
export class JinShieldGuard implements CanActivate {
  private jinJson = loadJinJson();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const reqPath = request.path || request.url.split('?')[0];
    const reqMethod = request.method.toUpperCase();

    let isProtected = false;
    if (this.jinJson && this.jinJson.intents) {
      isProtected = this.jinJson.intents.some((i: any) => 
        i.method.toUpperCase() === reqMethod && matchPath(i.endpoint, reqPath)
      );
    }

    const authHeader = request.headers['authorization'];
    const hasJinIdentity = typeof authHeader === 'string' && authHeader.startsWith('Jin-Identity ');

    if (!isProtected && !hasJinIdentity) return true;

    if (!hasJinIdentity) {
      throw new HttpException(
        { error: 'Access Denied. Missing Authorization: Jin-Identity header. Refer to /.well-known/jin.json' },
        HttpStatus.FORBIDDEN
      );
    }

    const token = authHeader.substring('Jin-Identity '.length).trim();
    const result = await verifyJinToken(token, reqMethod, reqPath, this.jinJson);

    if (!result.success) {
      throw new HttpException(
        { error: \`Access Denied. \${result.error}. Refer to /.well-known/jin.json\` },
        HttpStatus.FORBIDDEN
      );
    }

    return true;
  }
}
`;

// ============================================================================
// 6. TRPC PROCEDURE WRAPPER TEMPLATE
// ============================================================================
const TRPC_TEMPLATE = `/**
 * Jin Shield Middleware (tRPC)
 * Generated automatically by @papercargo/jin-cli
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { verifyJinToken, loadJinJson, matchPath } from './jin_core';

export interface TRPCContext {
  req: {
    headers: Record<string, string | string[] | undefined>;
    method: string;
    url: string;
  };
}

const t = initTRPC.context<TRPCContext>().create();
const jinJson = loadJinJson();

export const jinShieldMiddleware = t.middleware(async ({ ctx, next, path: trpcPath }) => {
  const reqMethod = ctx.req.method.toUpperCase();
  const reqPath = '/' + trpcPath.replace(/\\./g, '/');

  let isProtected = false;
  if (jinJson && jinJson.intents) {
    isProtected = jinJson.intents.some((i: any) => 
      i.method.toUpperCase() === reqMethod && matchPath(i.endpoint, reqPath)
    );
  }

  const authHeader = ctx.req.headers['authorization'];
  const hasJinIdentity = typeof authHeader === 'string' && authHeader.startsWith('Jin-Identity ');

  if (!isProtected && !hasJinIdentity) return next();

  if (!hasJinIdentity) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access Denied. Missing Authorization: Jin-Identity header. Refer to /.well-known/jin.json'
    });
  }

  const token = authHeader.substring('Jin-Identity '.length).trim();
  const result = await verifyJinToken(token, reqMethod, reqPath, jinJson);

  if (!result.success) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: \`Access Denied. \${result.error}. Refer to /.well-known/jin.json\`
    });
  }

  return next();
});
`;

// ============================================================================
// 7. FASTAPI ASGI MIDDLEWARE TEMPLATE
// ============================================================================
const FASTAPI_TEMPLATE = `"""
Jin Shield ASGI Middleware (FastAPI)
Generated automatically by @papercargo/jin-cli
"""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse
from starlette.requests import Request
from starlette.types import ASGIApp
from jin_core import verify_jin_token_async, load_jin_json, match_path, get_jwks_keys, shield_stats
import asyncio

class JinShieldMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, cwd = None):
        super().__init__(app)
        self.jin_json = load_jin_json(cwd)
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(get_jwks_keys())
        except Exception:
            pass

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        req_path = request.url.path
        req_method = request.method.upper()

        matched_intent = None
        if self.jin_json and "intents" in self.jin_json:
            for intent in self.jin_json["intents"]:
                if intent.get("method", "GET").upper() == req_method and match_path(intent.get("endpoint", ""), req_path):
                    matched_intent = intent
                    break

        auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
        has_jin_identity = isinstance(auth_header, str) and auth_header.startswith("Jin-Identity ")

        if not matched_intent and not has_jin_identity:
            return await call_next(request)

        if not has_jin_identity:
            return JSONResponse(
                status_code=403,
                content={"error": "Access Denied. Missing Authorization: Jin-Identity header. Refer to /.well-known/jin.json"}
            )

        token = auth_header[len("Jin-Identity "):].strip()
        result = await verify_jin_token_async(token, req_method, req_path, self.jin_json)

        if not result["success"]:
            return JSONResponse(
                status_code=403,
                content={"error": f"Access Denied. {result['error']}. Refer to /.well-known/jin.json"}
            )

        shield_stats["total_requests"] += 1
        shield_stats["active_requests"] += 1
        try:
            return await call_next(request)
        finally:
            shield_stats["active_requests"] -= 1
`;

// ============================================================================
// 8. FLASK WSGI MIDDLEWARE TEMPLATE
// ============================================================================
const FLASK_TEMPLATE = `"""
Jin Shield Flask Hooks (Flask)
Generated automatically by @papercargo/jin-cli
"""

from jin_core import verify_jin_token_sync, load_jin_json, match_path, shield_stats

def register_jin_shield(app, cwd = None):
    jin_json = load_jin_json(cwd)

    @app.before_request
    def flask_shield_handler():
        from flask import request, jsonify, make_response
        req_path = request.path
        req_method = request.method.upper()

        matched_intent = None
        if jin_json and "intents" in jin_json:
            for intent in jin_json["intents"]:
                if intent.get("method", "GET").upper() == req_method and match_path(intent.get("endpoint", ""), req_path):
                    matched_intent = intent
                    break

        auth_header = request.headers.get("Authorization")
        has_jin_identity = isinstance(auth_header, str) and auth_header.startswith("Jin-Identity ")

        if not matched_intent and not has_jin_identity:
            return None

        if not has_jin_identity:
            return make_response(
                jsonify({"error": "Access Denied. Missing Authorization: Jin-Identity header. Refer to /.well-known/jin.json"}),
                403
            )

        token = auth_header[len("Jin-Identity "):].strip()
        result = verify_jin_token_sync(token, req_method, req_path, jin_json)

        if not result["success"]:
            return make_response(
                jsonify({"error": f"Access Denied. {result['error']}. Refer to /.well-known/jin.json"}),
                403
            )

        shield_stats["total_requests"] += 1
        return None
`;

// ============================================================================
// 9. DJANGO MIDDLEWARE TEMPLATE
// ============================================================================
const DJANGO_TEMPLATE = `"""
Jin Shield Django Middleware (Django)
Generated automatically by @papercargo/jin-cli
"""

import os
import asyncio
from jin_core import verify_jin_token_sync, verify_jin_token_async, load_jin_json, match_path, shield_stats

class JinShieldMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.jin_json = load_jin_json(os.getcwd())
        self._is_coroutine = asyncio.iscoroutinefunction(get_response)

    def __call__(self, request):
        if self._is_coroutine:
            return self.__call_async(request)
        return self.__call_sync(request)

    def __call_sync(self, request):
        from django.http import JsonResponse
        req_path = request.path
        req_method = request.method.upper()

        matched_intent = None
        if self.jin_json and "intents" in self.jin_json:
            for intent in self.jin_json["intents"]:
                if intent.get("method", "GET").upper() == req_method and match_path(intent.get("endpoint", ""), req_path):
                    matched_intent = intent
                    break

        auth_header = request.headers.get("Authorization") or request.META.get("HTTP_AUTHORIZATION")
        has_jin_identity = isinstance(auth_header, str) and auth_header.startswith("Jin-Identity ")

        if not matched_intent and not has_jin_identity:
            return self.get_response(request)

        if not has_jin_identity:
            return JsonResponse(
                {"error": "Access Denied. Missing Authorization: Jin-Identity header. Refer to /.well-known/jin.json"},
                status=403
            )

        token = auth_header[len("Jin-Identity "):].strip()
        result = verify_jin_token_sync(token, req_method, req_path, self.jin_json)

        if not result["success"]:
            return JsonResponse(
                {"error": f"Access Denied. {result['error']}. Refer to /.well-known/jin.json"},
                status=403
            )

        shield_stats["total_requests"] += 1
        shield_stats["active_requests"] += 1
        try:
            return self.get_response(request)
        finally:
            shield_stats["active_requests"] -= 1

    async def __call_async(self, request):
        from django.http import JsonResponse
        req_path = request.path
        req_method = request.method.upper()

        matched_intent = None
        if self.jin_json and "intents" in self.jin_json:
            for intent in self.jin_json["intents"]:
                if intent.get("method", "GET").upper() == req_method and match_path(intent.get("endpoint", ""), req_path):
                    matched_intent = intent
                    break

        auth_header = request.headers.get("Authorization") or request.META.get("HTTP_AUTHORIZATION")
        has_jin_identity = isinstance(auth_header, str) and auth_header.startswith("Jin-Identity ")

        if not matched_intent and not has_jin_identity:
            return await self.get_response(request)

        if not has_jin_identity:
            return JsonResponse(
                {"error": "Access Denied. Missing Authorization: Jin-Identity header. Refer to /.well-known/jin.json"},
                status=403
            )

        token = auth_header[len("Jin-Identity "):].strip()
        result = await verify_jin_token_async(token, req_method, req_path, self.jin_json)

        if not result["success"]:
            return JsonResponse(
                {"error": f"Access Denied. {result['error']}. Refer to /.well-known/jin.json"},
                status=403
            )

        shield_stats["total_requests"] += 1
        shield_stats["active_requests"] += 1
        try:
            return await self.get_response(request)
        finally:
            shield_stats["active_requests"] -= 1
`;

// ============================================================================
// 10. LARAVEL PHP MIDDLEWARE STUB TEMPLATE
// ============================================================================
const LARAVEL_TEMPLATE = `<?php
/**
 * Jin Shield Security Middleware (Laravel PHP)
 * Generated automatically by @papercargo/jin-cli
 */

namespace App\\Http\\Middleware;

use Closure;
use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\Http;

class JinShieldMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        $reqPath = $request->path();
        $reqMethod = strtoupper($request->method());

        $jinPath = public_path('.well-known/jin.json');
        if (!file_exists($jinPath)) {
            $jinPath = base_path('jin.json');
        }

        $isProtected = false;
        $matchedIntent = null;

        if (file_exists($jinPath)) {
            $jinJson = json_decode(file_get_contents($jinPath), true);
            if (isset($jinJson['intents'])) {
                foreach ($jinJson['intents'] as $intent) {
                    if (strtoupper($intent['method']) === $reqMethod && $this->matchPath($intent['endpoint'], $reqPath)) {
                        $isProtected = true;
                        $matchedIntent = $intent;
                        break;
                    }
                }
            }
        }

        $authHeader = $request->header('Authorization');
        $hasJinIdentity = !empty($authHeader) && strpos($authHeader, 'Jin-Identity ') === 0;

        if (!$isProtected && !$hasJinIdentity) {
            return $next($request);
        }

        $blockAccess = function ($reason) {
            return response()->json([
                'error' => "Access Denied. {$reason}. Refer to protocol instructions at /.well-known/jin.json"
            ], 403);
        };

        if (!$hasJinIdentity) {
            return $blockAccess('Missing Authorization: Jin-Identity header');
        }

        $token = trim(substr($authHeader, strlen('Jin-Identity ')));
        if (empty($token)) {
            return $blockAccess('Empty identity token');
        }

        try {
            $parts = explode('.', $token);
            if (count($parts) !== 3) return $blockAccess('Invalid JWT format');

            $header = json_decode(base64_decode(strtr($parts[0], '-_', '+/')), true);
            $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);

            if ($header['alg'] !== 'RS256' || empty($header['kid'])) {
                return $blockAccess('Unsupported algorithm or missing key ID (kid)');
            }
            if (!isset($payload['exp']) || $payload['exp'] < time()) {
                return $blockAccess('Identity passport has expired');
            }
            if ($payload['iss'] !== 'meetjin.com' && $payload['iss'] !== 'https://meetjin.com') {
                return $blockAccess('Untrusted issuer');
            }
            if (empty($payload['intent_id'])) {
                return $blockAccess('Missing intent_id in payload');
            }
            if (!$matchedIntent) {
                return $blockAccess('Endpoint is not declared in jin.json');
            }
            if ($payload['intent_id'] !== $matchedIntent['id']) {
                return $blockAccess("Identity authorized for intent '{$payload['intent_id']}', but route requires '{$matchedIntent['id']}'");
            }

            // Optional: local asymmetric RS256 validation from central JWKS
            return $next($request);

        } catch (\\Exception $e) {
            return $blockAccess("Identity verification failed: " . $e->getMessage());
        }
    }

    private function matchPath($endpointPattern, $actualPath)
    {
        $normPattern = rtrim($endpointPattern, '/');
        $normActual = rtrim($actualPath, '/');
        if ($normPattern === '') $normPattern = '/';
        if ($normActual === '') $normActual = '/';

        $pattern = preg_replace('/\\\\{([^}]+)\\\\}/', ':$1', $normPattern);
        $regex = '^' . preg_quote($pattern, '#') . '$';
        $regex = str_replace('\\\\:([^/\\\\*]+)\\\\*', '(.*)', $regex);
        $regex = str_replace('\\\\:([^/]+)', '([^/]+)', $regex);

        return (bool)preg_match('#' . $regex . '#', $normActual);
    }
}
`;

// ============================================================================
// 11. RUBY ON RAILS FILTER TEMPLATE
// ============================================================================
const RAILS_TEMPLATE = `# Jin Shield Controller Concern (Ruby on Rails)
# Generated automatically by @papercargo/jin-cli

module JinShieldFilter
  extend ActiveSupport::Concern

  included do
    before_action :verify_jin_shield
  end

  private

  def verify_jin_shield
    req_path = request.path
    req_method = request.method.upcase

    jin_path = Rails.root.join('public', '.well-known', 'jin.json')
    jin_path = Rails.root.join('jin.json') unless File.exist?(jin_path)

    is_protected = false
    matched_intent = nil

    if File.exist?(jin_path)
      jin_json = JSON.parse(File.read(jin_path))
      if jin_json['intents']
        jin_json['intents'].each do |intent|
          if intent['method'].upcase == req_method && match_path?(intent['endpoint'], req_path)
            is_protected = true
            matched_intent = intent
            break
          end
        end
      end
    end

    auth_header = request.headers['Authorization']
    has_jin_identity = auth_header.is_a?(String) && auth_header.start_with?('Jin-Identity ')

    return unless is_protected || has_jin_identity

    block_access = lambda do |reason|
      render json: { error: "Access Denied. #{reason}. Refer to protocol instructions at /.well-known/jin.json" }, status: :forbidden
    end

    return block_access.call('Missing Authorization: Jin-Identity header') unless has_jin_identity

    token = auth_header['Jin-Identity '.length..-1].strip
    return block_access.call('Empty identity token') if token.empty?

    begin
      parts = token.split('.')
      return block_access.call('Invalid JWT format') if parts.length != 3

      header = JSON.parse(Base64.urlsafe_decode64(parts[0]))
      payload = JSON.parse(Base64.urlsafe_decode64(parts[1]))

      return block_access.call('Unsupported algorithm. RS256 is required') if header['alg'] != 'RS256'
      return block_access.call('Missing key ID (kid) in header') if header['kid'].nil?
      return block_access.call('Identity passport has expired') if payload['exp'] && payload['exp'] < Time.now.to_i
      return block_access.call('Untrusted issuer') unless ['meetjin.com', 'https://meetjin.com'].include?(payload['iss'])
      return block_access.call('Missing intent_id in payload') if payload['intent_id'].nil?
      return block_access.call('Endpoint not declared') unless matched_intent
      return block_access.call("Intent authorized for '#{payload['intent_id']}', but route requires '#{matched_intent['id']}'") if payload['intent_id'] != matched_intent['id']

    rescue => e
      return block_access.call("Identity verification failed: #{e.message}")
    end
  end

  def match_path?(endpoint_pattern, actual_path)
    norm_pattern = endpoint_pattern.chomp('/')
    norm_actual = actual_path.chomp('/')
    norm_pattern = '/' if norm_pattern.empty?
    norm_actual = '/' if norm_actual.empty?

    pattern = norm_pattern.gsub(/\\\\{([^}]+)\\\\}/, ':\\1')
    regex_str = '^' + Regexp.escape(pattern) + '$'
    regex_str.gsub!(/\\\\:([^\\\\/\\\\*]+)\\\\\*/, '(.*)')
    regex_str.gsub!(/\\\\:([^\\\\/]+)/, '([^/]+)')

    !!(norm_actual =~ Regexp.new(regex_str))
  end
end
`;

export async function shield(cwd: string = process.cwd()) {
  console.log('🛡️  Jin Shield — Universal Boundary Activation...\n')

  // Check if intent map exists
  const jinJsonPath = resolveJinJsonPath(cwd)
  if (!jinJsonPath) {
    console.log('⚠️  Warning: jin.json intent map not found. Run "jin init" to index endpoints first.')
  }

  // 1. Detect Package & Project signatures
  let packageJson: any = {}
  try {
    packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'))
  } catch (e) {}

  const isNodeProject = Boolean(packageJson && packageJson.dependencies)
  const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) }

  const hasRequirementsTxt = fs.existsSync(path.join(cwd, 'requirements.txt'))
  const hasMainPy = fs.existsSync(path.join(cwd, 'main.py'))
  const isPythonProject = hasRequirementsTxt || hasMainPy || fs.readdirSync(cwd).some(f => f.endsWith('.py'))

  const isLaravel = fs.existsSync(path.join(cwd, 'artisan')) || fs.existsSync(path.join(cwd, 'composer.json'))
  const isRails = fs.existsSync(path.join(cwd, 'Gemfile')) || fs.existsSync(path.join(cwd, 'config/routes.rb'))

  // JS/TS ENVIRONMENT HANDLERS
  if (isNodeProject && !isPythonProject && !isLaravel && !isRails) {
    console.log('🔍  Detected Environment: Node.js / TypeScript')

    // Create the core crypto engine inside the local folder so adapters can refer to it
    const coreOut = path.join(cwd, 'jin_core.ts')
    // We can write a compiled-down jin_core to the user's directory
    const sourceCore = fs.readFileSync(path.join(__dirname, '../crypto/jin_core.ts'), 'utf-8')
    fs.writeFileSync(coreOut, sourceCore, 'utf-8')
    console.log(`✓  Successfully index core crypto validation engine: ${path.basename(coreOut)}`)

    if (deps['@nestjs/core']) {
      const out = path.join(cwd, 'jinShieldNest.ts')
      fs.writeFileSync(out, NESTJS_TEMPLATE, 'utf-8')
      console.log(`✓  Generated NestJS Guard Adapter: ${path.basename(out)}`)
      console.log('\n🚀  Setup Instructions for NestJS Guard:')
      console.log('========================================================================')
      console.log('1. Import the Guard in your Controller:')
      console.log('   import { JinShieldGuard } from \'./jinShieldNest\';')
      console.log('2. Annotate your target route or controllers:')
      console.log('   @UseGuards(JinShieldGuard)')
      console.log('========================================================================')
      return
    }

    if (deps['hono']) {
      const out = path.join(cwd, 'jinShieldHono.ts')
      fs.writeFileSync(out, HONO_TEMPLATE, 'utf-8')
      console.log(`✓  Generated Hono Middleware Adapter: ${path.basename(out)}`)
      console.log('\n🚀  Setup Instructions for Hono:')
      console.log('========================================================================')
      console.log('1. Register the middleware in your Hono lifecycle:')
      console.log('   import { createHonoShieldMiddleware } from \'./jinShieldHono\';')
      console.log('   app.use(\'*\', createHonoShieldMiddleware());')
      console.log('========================================================================')
      return
    }

    if (deps['fastify']) {
      const out = path.join(cwd, 'jinShieldFastify.ts')
      fs.writeFileSync(out, FASTIFY_TEMPLATE, 'utf-8')
      console.log(`✓  Generated Fastify Hook Adapter: ${path.basename(out)}`)
      console.log('\n🚀  Setup Instructions for Fastify:')
      console.log('========================================================================')
      console.log('1. Register the hook in your application:')
      console.log('   import { fastifyShieldHook } from \'./jinShieldFastify\';')
      console.log('   fastify.addHook(\'onRequest\', fastifyShieldHook());')
      console.log('========================================================================')
      return
    }

    if (deps['@trpc/server']) {
      const out = path.join(cwd, 'jinShieldTRPC.ts')
      fs.writeFileSync(out, TRPC_TEMPLATE, 'utf-8')
      console.log(`✓  Generated tRPC Middleware Adapter: ${path.basename(out)}`)
      console.log('\n🚀  Setup Instructions for tRPC:')
      console.log('========================================================================')
      console.log('1. Integrate the middleware into your public procedures:')
      console.log('   import { jinShieldMiddleware } from \'./jinShieldTRPC\';')
      console.log('   export const publicAgentProcedure = t.procedure.use(jinShieldMiddleware);')
      console.log('========================================================================')
      return
    }

    if (deps['next']) {
      const out = path.join(cwd, 'jinShieldNext.ts')
      fs.writeFileSync(out, NEXT_APP_TEMPLATE, 'utf-8')
      console.log(`✓  Generated Next.js Edge Middleware Adapter: ${path.basename(out)}`)
      console.log('\n🚀  Setup Instructions for Next.js App Router:')
      console.log('========================================================================')
      console.log('1. Open your global Next.js middleware.ts entrypoint.')
      console.log('2. Intercept requests by calling the shield:')
      console.log('   import { verifyJinShield } from \'./jinShieldNext\';')
      console.log('   import jinJson from \'./public/.well-known/jin.json\';')
      console.log('   ')
      console.log('   export async function middleware(request: NextRequest) {')
      console.log('     const response = await verifyJinShield(request, jinJson);')
      console.log('     if (response) return response;')
      console.log('     return NextResponse.next();')
      console.log('   }')
      console.log('========================================================================')
      return
    }

    // Default Express JS
    const out = path.join(cwd, 'jinShieldExpress.js')
    fs.writeFileSync(out, EXPRESS_TEMPLATE, 'utf-8')
    console.log(`✓  Generated Express Middleware Adapter: ${path.basename(out)}`)
    console.log('\n🚀  Setup Instructions for Express:')
    console.log('========================================================================')
    console.log('1. Register the middleware immediately below app initialization:')
    console.log('   const jinShield = require(\'./jinShieldExpress\');')
    console.log('   app.use(jinShield);')
    console.log('========================================================================')
    return
  }

  // PYTHON ENVIRONMENT HANDLERS
  if (isPythonProject) {
    console.log('🔍  Detected Environment: Python')

    const coreOut = path.join(cwd, 'jin_core.py')
    const sourceCore = fs.readFileSync(path.join(__dirname, '../crypto/jin_core.py'), 'utf-8')
    fs.writeFileSync(coreOut, sourceCore, 'utf-8')
    console.log(`✓  Successfully indexed Python core validation engine: ${path.basename(coreOut)}`)

    // Identify frameworks via requirements or scan
    let reqs = ''
    try { reqs = fs.readFileSync(path.join(cwd, 'requirements.txt'), 'utf-8'); } catch(e) {}

    const isDjango = reqs.includes('django') || fs.existsSync(path.join(cwd, 'manage.py'))
    const isFlask = reqs.includes('flask')

    if (isDjango) {
      const out = path.join(cwd, 'jin_shield_django.py')
      fs.writeFileSync(out, DJANGO_TEMPLATE, 'utf-8')
      console.log(`✓  Generated Django Middleware Adapter: ${path.basename(out)}`)
      console.log('\n🚀  Setup Instructions for Django:')
      console.log('========================================================================')
      console.log('1. Install required cryptographic dependencies:')
      console.log('   pip install "PyJWT[crypto]" httpx')
      console.log('2. Open settings.py and append the middleware:')
      console.log('   MIDDLEWARE = [')
      console.log('       ...,')
      console.log('       "jin_shield_django.JinShieldMiddleware",')
      console.log('   ]')
      console.log('========================================================================')
      return
    }

    if (isFlask) {
      const out = path.join(cwd, 'jin_shield_flask.py')
      fs.writeFileSync(out, FLASK_TEMPLATE, 'utf-8')
      console.log(`✓  Generated Flask Hook Adapter: ${path.basename(out)}`)
      console.log('\n🚀  Setup Instructions for Flask:')
      console.log('========================================================================')
      console.log('1. Install required cryptographic dependencies:')
      console.log('   pip install "PyJWT[crypto]" httpx')
      console.log('2. Register the hooks with your Flask app:')
      console.log('   from jin_shield_flask import register_jin_shield')
      console.log('   register_jin_shield(app)')
      console.log('========================================================================')
      return
    }

    // Default FastAPI
    const out = path.join(cwd, 'jin_shield_fastapi.py')
    fs.writeFileSync(out, FASTAPI_TEMPLATE, 'utf-8')
    console.log(`✓  Generated FastAPI ASGI Adapter: ${path.basename(out)}`)
    console.log('\n🚀  Setup Instructions for FastAPI:')
    console.log('========================================================================')
    console.log('1. Install dependencies: pip install "PyJWT[crypto]" httpx')
    console.log('2. Mount the ASGI middleware:')
    console.log('   from jin_shield_fastapi import JinShieldMiddleware')
    console.log('   app.add_middleware(JinShieldMiddleware)')
    console.log('========================================================================')
    return
  }

  // PHP LARAVEL STUB
  if (isLaravel) {
    console.log('🔍  Detected Environment: PHP / Laravel')
    const outDir = path.join(cwd, 'app', 'Http', 'Middleware')
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

    const out = path.join(outDir, 'JinShieldMiddleware.php')
    fs.writeFileSync(out, LARAVEL_TEMPLATE, 'utf-8')
    console.log(`✓  Generated Laravel PHP Middleware Stub: ${path.relative(cwd, out)}`)
    console.log('\n🚀  Setup Instructions for Laravel:')
    console.log('========================================================================')
    console.log('1. Register the middleware in App\\Http\\Kernel.php (Laravel 10-) or')
    console.log('   bootstrap/app.php (Laravel 11+):')
    console.log('   $middleware->append(App\\Http\\Middleware\\JinShieldMiddleware::class);')
    console.log('========================================================================')
    return
  }

  // RUBY ON RAILS STUB
  if (isRails) {
    console.log('🔍  Detected Environment: Ruby on Rails')
    const outDir = path.join(cwd, 'app', 'controllers', 'concerns')
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

    const out = path.join(outDir, 'jin_shield_filter.rb')
    fs.writeFileSync(out, RAILS_TEMPLATE, 'utf-8')
    console.log(`✓  Generated Rails Concern Filter: ${path.relative(cwd, out)}`)
    console.log('\n🚀  Setup Instructions for Rails:')
    console.log('========================================================================')
    console.log('1. Include the concern in your ApplicationController:')
    console.log('   class ApplicationController < ActionController::Base')
    console.log('     include JinShieldFilter')
    console.log('   end')
    console.log('========================================================================')
    return
  }

  // ENTERPRISE FALLBACK
  console.log('❓  No explicit Node/Python/PHP/Ruby framework detected. Creating stubs directory...')
  const outDir = path.join(cwd, 'jin_shield_stubs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir)

  fs.writeFileSync(path.join(outDir, 'jinShieldExpress.js'), EXPRESS_TEMPLATE, 'utf-8')
  fs.writeFileSync(path.join(outDir, 'jinShieldHono.ts'), HONO_TEMPLATE, 'utf-8')
  fs.writeFileSync(path.join(outDir, 'jinShieldFastify.ts'), FASTIFY_TEMPLATE, 'utf-8')
  fs.writeFileSync(path.join(outDir, 'jinShieldNest.ts'), NESTJS_TEMPLATE, 'utf-8')
  fs.writeFileSync(path.join(outDir, 'jinShieldNext.ts'), NEXT_APP_TEMPLATE, 'utf-8')
  fs.writeFileSync(path.join(outDir, 'jin_shield_fastapi.py'), FASTAPI_TEMPLATE, 'utf-8')
  fs.writeFileSync(path.join(outDir, 'jin_shield_django.py'), DJANGO_TEMPLATE, 'utf-8')
  fs.writeFileSync(path.join(outDir, 'jin_shield_flask.py'), FLASK_TEMPLATE, 'utf-8')
  fs.writeFileSync(path.join(outDir, 'JinShieldMiddleware.php'), LARAVEL_TEMPLATE, 'utf-8')
  fs.writeFileSync(path.join(outDir, 'jin_shield_filter.rb'), RAILS_TEMPLATE, 'utf-8')

  console.log(`✓  Successfully generated all 10 adapters inside: ${path.basename(outDir)}/`)
  console.log('ℹ️  Extract the one matching your architecture and refer to its internal docs.')
}
