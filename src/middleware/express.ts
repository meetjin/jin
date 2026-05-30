import fs from 'fs'
import path from 'path'
import https from 'https'
import crypto from 'crypto'
import { IncomingMessage, ServerResponse } from 'http'

// Define interfaces for Express request/response to compile without external packages
export interface JinShieldRequest extends IncomingMessage {
  path: string;
  method: string;
  baseUrl?: string;
  originalUrl?: string;
  headers: IncomingMessage['headers'];
}

export interface JinShieldResponse extends ServerResponse {
  status(code: number): JinShieldResponse;
  json(data: any): void;
}

export type JinShieldNext = (err?: any) => void;

// Atomic stats tracker
export const shieldStats = {
  activeRequests: 0,
  totalRequests: 0
};

// JWKS cache
let cachedKeys: any[] | null = null;
let fetchingPromise: Promise<any[]> | null = null;
const JWKS_URL = 'https://meetjin.com/.well-known/jwks.json';

/**
 * Fetch JWKS keys from central authority and cache them.
 */
export async function getJwksKeys(jwksUrl: string = JWKS_URL): Promise<any[]> {
  if (cachedKeys) return cachedKeys;
  if (fetchingPromise) return fetchingPromise;

  fetchingPromise = new Promise((resolve, reject) => {
    https.get(jwksUrl, (res) => {
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
    fetchingPromise = null; // Allow retrying next time
    throw err;
  }
}

// Pre-fetch keys on boot (fail silently to avoid crashing the server on startup)
getJwksKeys().catch((err) => {
  console.warn(`[Jin Shield] Warning: Could not pre-fetch JWKS keys from ${JWKS_URL}. Retrying on first request: ${err.message}`);
});

/**
 * Path matching utility that supports Express-style and FastAPI-style paths.
 */
export function matchPath(endpointPattern: string, actualPath: string): boolean {
  const normPattern = endpointPattern.endsWith('/') && endpointPattern !== '/' ? endpointPattern.slice(0, -1) : endpointPattern;
  const normActual = actualPath.endsWith('/') && actualPath !== '/' ? actualPath.slice(0, -1) : actualPath;

  // Convert FastAPI {param} to Express :param
  let pattern = normPattern.replace(/\{([^}]+)\}/g, ':$1');

  // Escape regex special chars but keep ':' and '*'
  const regexString = '^' + pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)\*/g, '(.*)') // :param* -> catch-all wildcard
    .replace(/:(\w+)/g, '([^/]+)') // :param -> segment match
    + '$';

  const regex = new RegExp(regexString);
  return regex.test(normActual);
}

/**
 * Resolves and loads local jin.json definition file
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
 * Native cryptographic JWT decode utility.
 */
function decodeJwt(token: string) {
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
 * Asymmetric cryptographic validation of RS256 JWT using native crypto module.
 */
function verifySignature(signedInput: string, signatureBase64Url: string, jwk: any): boolean {
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
 * Factory that returns the Express Jin Shield Middleware
 */
export function createJinShieldMiddleware(options: { cwd?: string; jwksUrl?: string } = {}) {
  const cwd = options.cwd || process.cwd();
  const jwksUrl = options.jwksUrl || JWKS_URL;
  const jinJson = loadJinJson(cwd);

  if (!jinJson) {
    console.warn('[Jin Shield] Warning: jin.json specification not found in standard paths. Shield is operating in validation-only mode.');
  }

  return async (req: JinShieldRequest, res: JinShieldResponse, next: JinShieldNext) => {
    // 1. Identify if the request targets a route protected in jin.json
    const reqPath = req.path || (req.originalUrl ? req.originalUrl.split('?')[0] : '/');
    const reqMethod = (req.method || 'GET').toUpperCase();

    let matchedIntent: any = null;
    if (jinJson && jinJson.intents) {
      for (const intent of jinJson.intents) {
        if (intent.method.toUpperCase() === reqMethod && matchPath(intent.endpoint, reqPath)) {
          matchedIntent = intent;
          break;
        }
      }
    }

    // 2. Extract Authorization Header
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const hasJinIdentity = typeof authHeader === 'string' && authHeader.startsWith('Jin-Identity ');

    // 3. Fallback checks: If it hits a protected route, OR passes Jin-Identity, it must be verified.
    // Otherwise, normal non-agent traffic can pass right through to other middlewares.
    if (!matchedIntent && !hasJinIdentity) {
      return next();
    }

    // Initialize block responder
    const blockAccess = (reason: string) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: `Access Denied. ${reason}. Refer to protocol instructions at /.well-known/jin.json` 
      }));
    };

    if (!hasJinIdentity) {
      return blockAccess('Missing Authorization: Jin-Identity header');
    }

    const token = (authHeader as string).substring('Jin-Identity '.length).trim();
    if (!token) {
      return blockAccess('Empty identity token');
    }

    try {
      // 4. Decode JWT structure
      const { header, payload, signature, signedInput } = decodeJwt(token);

      // Verify header format
      if (header.alg !== 'RS256') {
        return blockAccess('Unsupported cryptographic algorithm. RS256 is required');
      }

      const kid = header.kid;
      if (!kid) {
        return blockAccess('Missing key ID (kid) in token header');
      }

      // 5. Fetch keys
      const keys = await getJwksKeys(jwksUrl);
      const matchingJwk = keys.find((k: any) => k.kid === kid);
      if (!matchingJwk) {
        return blockAccess('Signatory key ID not recognized by meetjin.com');
      }

      // 6. Crytographic Asymmetric Signature Check (RS256)
      const isSignatureValid = verifySignature(signedInput, signature, matchingJwk);
      if (!isSignatureValid) {
        return blockAccess('Invalid cryptographic passport signature');
      }

      // 7. Verify standard Claims
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return blockAccess('Identity passport has expired');
      }

      const verifiedIssuer = payload.iss === 'meetjin.com' || payload.iss === 'https://meetjin.com';
      if (!verifiedIssuer) {
        return blockAccess('Untrusted token issuer');
      }

      // 8. Intent and Path alignment verification
      if (!payload.intent_id) {
        return blockAccess('Missing intent_id claim in identity payload');
      }

      if (!matchedIntent) {
        return blockAccess(`Endpoint ${reqMethod} ${reqPath} is not declared in the project's jin.json protocol specification`);
      }

      if (payload.intent_id !== matchedIntent.id) {
        return blockAccess(`Identity passport is authorized for intent '${payload.intent_id}', but requested endpoint requires intent '${matchedIntent.id}'`);
      }

      // 9. Atomic tracking counter increment
      shieldStats.totalRequests++;
      shieldStats.activeRequests++;

      res.on('finish', () => {
        shieldStats.activeRequests--;
      });

      // Verification passed completely! Let request pass to target route.
      return next();

    } catch (err: any) {
      return blockAccess(`Identity verification failed: ${err.message}`);
    }
  };
}
