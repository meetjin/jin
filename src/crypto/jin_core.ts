import fs from 'fs'
import path from 'path'
import https from 'https'
import crypto from 'crypto'
import http from 'http'
import { IncomingMessage, ServerResponse } from 'http'
import jwt from 'jsonwebtoken'

// Interfaces & Types
export interface JinShieldStats {
  activeRequests: number;
  totalRequests: number;
}

export interface VerificationResult {
  success: boolean;
  error?: string;
  payload?: any;
}

// Global in-memory statistics tracking
export const shieldStats: JinShieldStats = {
  activeRequests: 0,
  totalRequests: 0
};

// Public JWKS cached keys
let cachedKeys: any[] | null = null;
let fetchingPromise: Promise<any[]> | null = null;
const JWKS_URL = process.env.JIN_JWKS_URL || 'https://meetjin.com/.well-known/jwks.json';

/**
 * Retrieves JWKS public keys from the central authority and caches them in memory.
 */
export async function getJwksKeys(jwksUrl: string = JWKS_URL): Promise<any[]> {
  if (cachedKeys) return cachedKeys;
  if (fetchingPromise) return fetchingPromise;

  fetchingPromise = new Promise((resolve, reject) => {
    const client = jwksUrl.startsWith('https:') ? https : http;
    client.get(jwksUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            throw new Error(`Failed to fetch JWKS: HTTP ${res.statusCode}`);
          }
          const jwks = JSON.parse(data);
          cachedKeys = jwks.keys || [];
          resolve(cachedKeys!);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });

  try {
    return await fetchingPromise;
  } catch (err) {
    fetchingPromise = null; // Enable retrying on next request
    throw err;
  }
}

// Pre-fetch JWKS keys silently to warm cache on boot
getJwksKeys().catch((err) => {
  console.warn(`[Jin Shield] Warning: Could not pre-fetch JWKS keys from ${JWKS_URL}. Retrying on first request: ${err.message}`);
});

/**
 * Path matching helper that accommodates both Express (:param) and FastAPI ({param}) styles.
 */
export function matchPath(endpointPattern: string, actualPath: string): boolean {
  const normPattern = endpointPattern.endsWith('/') && endpointPattern !== '/' ? endpointPattern.slice(0, -1) : endpointPattern;
  const normActual = actualPath.endsWith('/') && actualPath !== '/' ? actualPath.slice(0, -1) : actualPath;

  // Convert FastAPI {param} to Express :param
  let pattern = normPattern.replace(/\{([^}]+)\}/g, ':$1');

  // Escape special regex characters safely without backslash interpolation parser issues
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

  // Convert pattern to a strict regex
  const regexString = '^' + escaped
    .replace(/:(\w+)\*/g, '(.*)') // :param* -> wildcard match
    .replace(/:(\w+)/g, '([^/]+)') // :param -> segment match
    + '$';

  const regex = new RegExp(regexString);
  return regex.test(normActual);
}

/**
 * Scans standard paths and parses the local jin.json protocol specification.
 */
export function loadJinJson(cwd: string = process.cwd()): any | null {
  const paths = [
    path.join(cwd, 'public', '.well-known', 'jin.json'),
    path.join(cwd, '.well-known', 'jin.json'),
    path.join(cwd, 'jin.json')
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch (e) {
        console.error(`[Jin Shield] Error parsing jin.json at ${p}:`, e);
      }
    }
  }
  return null;
}

/**
 * Decodes base64url encoded parts of a JWT.
 */
export function decodeJwt(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT token format');
  }

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  const signature = parts[2];
  const signedInput = parts[0] + '.' + parts[1];

  return { header, payload, signature, signedInput };
}

/**
 * Locally validates RS256 signature against JWK using native crypto module.
 */
export function verifySignature(signedInput: string, signatureBase64Url: string, jwk: any): boolean {
  if (!jwk.n || !jwk.e) {
    throw new Error('Invalid JWK: Missing RSA modulus or exponent');
  }

  const publicKey = crypto.createPublicKey({
    key: {
      kty: 'RSA',
      n: jwk.n,
      e: jwk.e,
      alg: 'RS256',
      use: 'sig'
    },
    format: 'jwk'
  });

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signedInput);
  const signatureBuf = Buffer.from(signatureBase64Url, 'base64url');
  
  return verifier.verify(publicKey, signatureBuf);
}

/**
 * Unified verification function core logic.
 */
export async function verifyJinToken(
  token: string,
  method: string,
  reqPath: string,
  jinJson: any,
  jwksUrl: string = JWKS_URL
): Promise<VerificationResult> {
  try {
    // 1. Identify matched intent inside jin.json
    const reqMethod = method.toUpperCase();
    let matchedIntent: any = null;
    if (jinJson && jinJson.intents) {
      for (const intent of jinJson.intents) {
        if (intent.method.toUpperCase() === reqMethod && matchPath(intent.endpoint, reqPath)) {
          matchedIntent = intent;
          break;
        }
      }
    }

    if (!token) {
      return { success: false, error: 'Empty identity token' };
    }

    // 2. Decode JWT structure to read kid from unverified header
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header) {
      return { success: false, error: 'Invalid JWT token format' };
    }

    const header = decoded.header;
    if (header.alg !== 'RS256') {
      return { success: false, error: 'Unsupported cryptographic algorithm. RS256 is required' };
    }

    const kid = header.kid;
    if (!kid) {
      return { success: false, error: 'Missing key ID (kid) in token header' };
    }

    // 3. Query cached keys with key-rotation handling
    let keys = await getJwksKeys(jwksUrl);
    let matchingJwk = keys.find((k) => k.kid === kid);
    if (!matchingJwk) {
      // kid is missing from local cache, briefly re-fetch the JWKS to handle key rotation
      cachedKeys = null;
      fetchingPromise = null;
      keys = await getJwksKeys(jwksUrl);
      matchingJwk = keys.find((k) => k.kid === kid);
    }

    if (!matchingJwk) {
      return { success: false, error: 'Signatory key ID not recognized by meetjin.com' };
    }

    // 4. Cryptographically verify the RS256 signature using the cached public key
    const publicKey = crypto.createPublicKey({
      key: {
        kty: 'RSA',
        n: matchingJwk.n,
        e: matchingJwk.e,
        alg: 'RS256',
        use: 'sig'
      },
      format: 'jwk'
    });

    let payload: any;
    try {
      payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256']
      });
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        return { success: false, error: 'Identity passport has expired' };
      }
      return { success: false, error: `Invalid cryptographic passport signature: ${err.message}` };
    }

    // 5. Assert that iss === "meetjin.com" (or https://meetjin.com) and the token is not expired (checked above)
    const verifiedIssuer = payload.iss === 'meetjin.com' || payload.iss === 'https://meetjin.com';
    if (!verifiedIssuer) {
      return { success: false, error: 'Untrusted token issuer' };
    }

    if (!payload.intent_id) {
      return { success: false, error: 'Missing intent_id claim in identity payload' };
    }

    // 6. Intent alignment
    if (!matchedIntent) {
      return { 
        success: false, 
        error: `Endpoint ${reqMethod} ${reqPath} is not declared in the project's jin.json protocol specification` 
      };
    }

    if (payload.intent_id !== matchedIntent.id) {
      return { 
        success: false, 
        error: `Identity passport is authorized for intent '${payload.intent_id}', but requested endpoint requires intent '${matchedIntent.id}'` 
      };
    }

    return { success: true, payload };

  } catch (err: any) {
    return { success: false, error: `Identity verification failed: ${err.message}` };
  }
}

// ============================================================================
// 1. EXPRESS & NEXT.JS PAGES ROUTER ADAPTER
// ============================================================================
export function expressAdapter(options: { cwd?: string; jwksUrl?: string } = {}) {
  const cwd = options.cwd || process.cwd();
  const jwksUrl = options.jwksUrl || JWKS_URL;
  const jinJson = loadJinJson(cwd);

  return async (req: any, res: any, next: any) => {
    const reqPath = req.path || (req.originalUrl ? req.originalUrl.split('?')[0] : '/');
    const reqMethod = (req.method || 'GET').toUpperCase();

    // Check if route is registered in jin.json
    let isProtected = false;
    if (jinJson && jinJson.intents) {
      isProtected = jinJson.intents.some((i: any) => i.method.toUpperCase() === reqMethod && matchPath(i.endpoint, reqPath));
    }

    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const hasJinIdentity = typeof authHeader === 'string' && authHeader.startsWith('Jin-Identity ');

    // Bypass check
    if (!isProtected && !hasJinIdentity) {
      return next();
    }

    const blockAccess = (reason: string) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Access Denied. ${reason}. Refer to protocol instructions at /.well-known/jin.json` }));
    };

    if (!hasJinIdentity) {
      return blockAccess('Missing Authorization: Jin-Identity header');
    }

    const token = authHeader.substring('Jin-Identity '.length).trim();
    const result = await verifyJinToken(token, reqMethod, reqPath, jinJson, jwksUrl);

    if (!result.success) {
      return blockAccess(result.error || 'Verification failed');
    }

    // Atomic tracking
    shieldStats.totalRequests++;
    shieldStats.activeRequests++;
    res.on('finish', () => {
      shieldStats.activeRequests--;
    });

    return next();
  };
}

// ============================================================================
// 2. NEXT.JS APP ROUTER MIDDLEWARE ADAPTER (Edge-Compatible Web-Crypto)
// ============================================================================
// Next.js Edge Middleware cannot use standard Node.js 'crypto' or 'fs' directly.
// This adapter utilizes Web Crypto API to verify RS256 signature.
export async function nextAppRouterAdapter(req: any, nextResponseClass: any, jinJson: any) {
  const reqUrl = new URL(req.url);
  const reqPath = reqUrl.pathname;
  const reqMethod = req.method.toUpperCase();

  let isProtected = false;
  if (jinJson && jinJson.intents) {
    isProtected = jinJson.intents.some((i: any) => i.method.toUpperCase() === reqMethod && matchPath(i.endpoint, reqPath));
  }

  const authHeader = req.headers.get('authorization');
  const hasJinIdentity = typeof authHeader === 'string' && authHeader.startsWith('Jin-Identity ');

  if (!isProtected && !hasJinIdentity) {
    return null; // Let the caller proceed
  }

  const blockResponse = (reason: string) => {
    return new nextResponseClass(
      JSON.stringify({ error: `Access Denied. ${reason}. Refer to protocol instructions at /.well-known/jin.json` }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  };

  if (!hasJinIdentity) {
    return blockResponse('Missing Authorization: Jin-Identity header');
  }

  const token = authHeader.substring('Jin-Identity '.length).trim();
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return blockResponse('Invalid JWT token format');
    }
    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const signatureStr = parts[2];

    if (header.alg !== 'RS256' || !header.kid) {
      return blockResponse('Unsupported or missing key ID (kid) in token header');
    }

    // Match intent
    let matchedIntent = null;
    if (jinJson && jinJson.intents) {
      matchedIntent = jinJson.intents.find((i: any) => i.method.toUpperCase() === reqMethod && matchPath(i.endpoint, reqPath));
    }
    if (!matchedIntent) {
      return blockResponse('Endpoint not declared in jin.json');
    }
    if (payload.intent_id !== matchedIntent.id) {
      return blockResponse(`Identity authorized for intent '${payload.intent_id}', but route requires '${matchedIntent.id}'`);
    }

    // Verify expirations
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return blockResponse('Identity passport has expired');
    }

    // Fetch keys from central authority via native Edge fetch
    const resKeys = await fetch(JWKS_URL);
    const jwks = await resKeys.json();
    const matchingJwk = jwks.keys.find((k: any) => k.kid === header.kid);
    if (!matchingJwk) {
      return blockResponse('Signatory key ID not recognized by meetjin.com');
    }

    // Web Crypto RS256 Verification
    const publicKeyData = {
      kty: "RSA",
      n: matchingJwk.n,
      e: matchingJwk.e,
      alg: "RS256",
      ext: true
    };
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

    const isSigValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      sigBinary,
      signedInputBuffer
    );

    if (!isSigValid) {
      return blockResponse('Invalid cryptographic passport signature');
    }

    return null; // Passed completely
  } catch (err: any) {
    return blockResponse(`Identity verification failed: ${err.message}`);
  }
}

// ============================================================================
// 3. HONO MIDDLEWARE ADAPTER
// ============================================================================
export function honoAdapter(options: { cwd?: string; jwksUrl?: string } = {}) {
  const cwd = options.cwd || process.cwd();
  const jwksUrl = options.jwksUrl || JWKS_URL;
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
    const result = await verifyJinToken(token, reqMethod, reqPath, jinJson, jwksUrl);

    if (!result.success) {
      c.status(403);
      return c.json({ error: `Access Denied. ${result.error}. Refer to /.well-known/jin.json` });
    }

    // Atomic tracking
    shieldStats.totalRequests++;
    shieldStats.activeRequests++;
    try {
      return await next();
    } finally {
      shieldStats.activeRequests--;
    }
  };
}

// ============================================================================
// 4. FASTIFY HOOK ADAPTER
// ============================================================================
export function fastifyAdapter(options: { cwd?: string; jwksUrl?: string } = {}) {
  const cwd = options.cwd || process.cwd();
  const jwksUrl = options.jwksUrl || JWKS_URL;
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

    if (!isProtected && !hasJinIdentity) {
      return;
    }

    const block = (reason: string) => {
      reply.code(403).send({ error: `Access Denied. ${reason}. Refer to protocol instructions at /.well-known/jin.json` });
    };

    if (!hasJinIdentity) {
      return block('Missing Authorization: Jin-Identity header');
    }

    const token = authHeader.substring('Jin-Identity '.length).trim();
    const result = await verifyJinToken(token, reqMethod, reqPath, jinJson, jwksUrl);

    if (!result.success) {
      return block(result.error || 'Verification failed');
    }

    shieldStats.totalRequests++;
    shieldStats.activeRequests++;
    request.raw.on('close', () => {
      shieldStats.activeRequests--;
    });
  };
}

// ============================================================================
// 5. NESTJS CANACTIVATE GUARD ADAPTER
// ============================================================================
// Decorator pattern representation compiled in NestJS environments.
export function getNestJSGuardSnippet() {
  return `import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { verifyJinToken, loadJinJson } from './jin_core';

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
        i.method.toUpperCase() === reqMethod && i.endpoint === reqPath
      );
    }

    const authHeader = request.headers['authorization'];
    const hasJinIdentity = typeof authHeader === 'string' && authHeader.startsWith('Jin-Identity ');

    if (!isProtected && !hasJinIdentity) {
      return true;
    }

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
}`;
}

// ============================================================================
// 6. TRPC PROCEDURE MIDDLEWARE ADAPTER
// ============================================================================
export function getTRPCMiddlewareSnippet() {
  return `import { initTRPC, TRPCError } from '@trpc/server';
import { verifyJinToken, loadJinJson } from './jin_core';

// Represents standard tRPC Context interface with raw request
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
  // Map tRPC procedure path (e.g., 'users.get') to standard route style '/users/get'
  const reqPath = '/' + trpcPath.replace(/\\./g, '/');

  let isProtected = false;
  if (jinJson && jinJson.intents) {
    isProtected = jinJson.intents.some((i: any) => 
      i.method.toUpperCase() === reqMethod && i.endpoint === reqPath
    );
  }

  const authHeader = ctx.req.headers['authorization'];
  const hasJinIdentity = typeof authHeader === 'string' && authHeader.startsWith('Jin-Identity ');

  if (!isProtected && !hasJinIdentity) {
    return next();
  }

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
}
