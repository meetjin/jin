"""
Jin Core Cryptographic Engine & Framework Adapters
Generated automatically by @papercargo/jin-cli

Establishes a zero-latency, in-memory machine-to-machine trust perimeter for Python backends.
Locally validates RS256 signatures of Jin-Identity tokens using PyJWT against meetjin.com rotated JWKS keys.
"""

import os
import re
import time
import json
import asyncio
from typing import Optional, Dict, Any, List, Union
import httpx
import jwt
from jwt.algorithms import RSAAlgorithm

# In-memoryrotated JWKS public key cache
cached_keys: Optional[List[Dict[str, Any]]] = None
fetching_lock = asyncio.Lock()
JWKS_URL = os.environ.get("JIN_JWKS_URL", "https://meetjin.com/.well-known/jwks.json")

# Global active execution counters
shield_stats = {
    "active_requests": 0,
    "total_requests": 0
}

async def get_jwks_keys(jwks_url: str = JWKS_URL) -> List[Dict[str, Any]]:
    """
    Retrieves public JWK keys from the central authority and caches them in memory.
    """
    global cached_keys
    if cached_keys is not None:
        return cached_keys

    async with fetching_lock:
        if cached_keys is not None:
            return cached_keys

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(jwks_url)
                if res.status_code == 200:
                    jwks = res.json()
                    cached_keys = jwks.get("keys", [])
                    return cached_keys or []
                else:
                    print(f"[Jin Shield] Error: Failed to fetch JWKS: HTTP {res.status_code}")
        except Exception as e:
            print(f"[Jin Shield] Error: Exception during JWKS fetching: {e}")
        
        return []

def get_jwks_keys_sync(jwks_url: str = JWKS_URL) -> List[Dict[str, Any]]:
    """
    Synchronous fallback JWKS fetcher (for Flask/Django WSGI execution paths).
    """
    global cached_keys
    if cached_keys is not None:
        return cached_keys

    try:
        response = httpx.get(jwks_url, timeout=10.0)
        if response.status_code == 200:
            cached_keys = response.json().get("keys", [])
            return cached_keys or []
    except Exception as e:
        print(f"[Jin Shield] Error: Sync fetch exception: {e}")
    return []

def match_path(endpoint_pattern: str, actual_path: str) -> bool:
    """
    Matches path patterns supporting both Express (:param) and FastAPI ({param}) styles.
    """
    norm_pattern = endpoint_pattern.rstrip('/') if endpoint_pattern != '/' else endpoint_pattern
    norm_actual = actual_path.rstrip('/') if actual_path != '/' else actual_path

    # Convert FastAPI {param:path} (catch-all) to :param* style
    pattern = re.sub(r'\{(\w+):path\}', r':\1*', norm_pattern)
    # Convert FastAPI {param} to :param style
    pattern = re.sub(r'\{(\w+)(?::\w+)?\}', r':\1', pattern)

    # Escape standard regex symbols but keep ':' and '*'
    escaped = re.escape(pattern)
    escaped = escaped.replace(r'\:', ':').replace(r'\*', '*')

    # Convert wildcard :param* to (.*)
    escaped = re.sub(r':\w+\*', r'(.*)', escaped)
    # Convert standard param segment match to ([^/]+)
    escaped = re.sub(r':\w+', r'([^/]+)', escaped)

    regex_string = f"^{escaped}$"
    try:
        return bool(re.match(regex_string, norm_actual))
    except Exception:
        return False

def load_jin_json(cwd: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Locates and parses the local jin.json specification.
    """
    target_dir = cwd or os.getcwd()
    paths = [
        os.path.join(target_dir, "public", ".well-known", "jin.json"),
        os.path.join(target_dir, ".well-known", "jin.json"),
        os.path.join(target_dir, "jin.json")
    ]

    for p in paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[Jin Shield] Error: Failed parsing jin.json at {p}: {e}")
    return None

def verify_jin_token_sync(
    token: str,
    method: str,
    req_path: str,
    jin_json: Optional[Dict[str, Any]],
    jwks_url: str = JWKS_URL
) -> Dict[str, Any]:
    """
    Core synchronous verification utility checking signature and path/intent claims.
    """
    if not token:
        return {"success": False, "error": "Empty identity token"}

    try:
        # 1. Decode header to identify kid
        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg")
        if alg != "RS256":
            return {"success": False, "error": "Unsupported algorithm. RS256 is required"}

        kid = unverified_header.get("kid")
        if not kid:
            return {"success": False, "error": "Missing kid claim in header"}

        # 2. Match intent inside jin.json
        req_method = method.upper()
        matched_intent = None
        if jin_json and "intents" in jin_json:
            for intent in jin_json["intents"]:
                intent_method = intent.get("method", "GET").upper()
                intent_endpoint = intent.get("endpoint", "")
                if intent_method == req_method and match_path(intent_endpoint, req_path):
                    matched_intent = intent
                    break

        # 3. Retrieve JWK key
        keys = get_jwks_keys_sync(jwks_url)
        matching_jwk = next((k for k in keys if k.get("kid") == kid), None)
        if not matching_jwk:
            return {"success": False, "error": "Signatory key ID not recognized by meetjin.com"}

        # 4. Local asymmetric signature verification
        public_key = RSAAlgorithm.from_jwk(matching_jwk)
        
        try:
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                options={
                    "verify_aud": False,
                    "verify_iss": False,
                    "verify_exp": True
                }
            )
        except jwt.ExpiredSignatureError:
            return {"success": False, "error": "Identity passport has expired"}
        except jwt.InvalidSignatureError:
            return {"success": False, "error": "Invalid cryptographic passport signature"}
        except Exception as e:
            return {"success": False, "error": f"Cryptographic verification failed: {e}"}

        # 5. Check claims
        issuer = payload.get("iss")
        if issuer not in ("meetjin.com", "https://meetjin.com"):
            return {"success": False, "error": "Untrusted token issuer"}

        intent_id = payload.get("intent_id")
        if not intent_id:
            return {"success": False, "error": "Missing intent_id claim in payload"}

        if not matched_intent:
            return {
                "success": False,
                "error": f"Endpoint {req_method} {req_path} is not declared in the project's jin.json protocol specification"
            }

        if intent_id != matched_intent.get("id"):
            return {
                "success": False,
                "error": f"Identity authorized for intent '{intent_id}', but requested endpoint requires intent '{matched_intent.get('id')}'"
            }

        return {"success": True, "payload": payload}

    except Exception as e:
        return {"success": False, "error": f"Identity validation failed: {str(e)}"}

async def verify_jin_token_async(
    token: str,
    method: str,
    req_path: str,
    jin_json: Optional[Dict[str, Any]],
    jwks_url: str = JWKS_URL
) -> Dict[str, Any]:
    """
    Core asynchronous verification utility checking signature and path/intent claims.
    """
    if not token:
        return {"success": False, "error": "Empty identity token"}

    try:
        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg")
        if alg != "RS256":
            return {"success": False, "error": "Unsupported algorithm. RS256 is required"}

        kid = unverified_header.get("kid")
        if not kid:
            return {"success": False, "error": "Missing kid claim in header"}

        req_method = method.upper()
        matched_intent = None
        if jin_json and "intents" in jin_json:
            for intent in jin_json["intents"]:
                intent_method = intent.get("method", "GET").upper()
                intent_endpoint = intent.get("endpoint", "")
                if intent_method == req_method and match_path(intent_endpoint, req_path):
                    matched_intent = intent
                    break

        keys = await get_jwks_keys(jwks_url)
        matching_jwk = next((k for k in keys if k.get("kid") == kid), None)
        if not matching_jwk:
            return {"success": False, "error": "Signatory key ID not recognized by meetjin.com"}

        public_key = RSAAlgorithm.from_jwk(matching_jwk)
        
        try:
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                options={
                    "verify_aud": False,
                    "verify_iss": False,
                    "verify_exp": True
                }
            )
        except jwt.ExpiredSignatureError:
            return {"success": False, "error": "Identity passport has expired"}
        except jwt.InvalidSignatureError:
            return {"success": False, "error": "Invalid cryptographic passport signature"}
        except Exception as e:
            return {"success": False, "error": f"Cryptographic verification failed: {e}"}

        issuer = payload.get("iss")
        if issuer not in ("meetjin.com", "https://meetjin.com"):
            return {"success": False, "error": "Untrusted token issuer"}

        intent_id = payload.get("intent_id")
        if not intent_id:
            return {"success": False, "error": "Missing intent_id claim in payload"}

        if not matched_intent:
            return {
                "success": False,
                "error": f"Endpoint {req_method} {req_path} is not declared in the project's jin.json protocol specification"
            }

        if intent_id != matched_intent.get("id"):
            return {
                "success": False,
                "error": f"Identity authorized for intent '{intent_id}', but requested endpoint requires intent '{matched_intent.get('id')}'"
            }

        return {"success": True, "payload": payload}

    except Exception as e:
        return {"success": False, "error": f"Identity validation failed: {str(e)}"}

# ============================================================================
# 1. FASTAPI ASGI MIDDLEWARE ADAPTER
# ============================================================================
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse
from starlette.requests import Request
from starlette.types import ASGIApp

class JinShieldFastAPI(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, cwd: Optional[str] = None, jwks_url: str = JWKS_URL):
        super().__init__(app)
        self.cwd = cwd or os.getcwd()
        self.jwks_url = jwks_url
        self.jin_json = load_jin_json(self.cwd)

        # Trigger background key pre-fetch during warm up
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(get_jwks_keys(self.jwks_url))
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
        result = await verify_jin_token_async(token, req_method, req_path, self.jin_json, self.jwks_url)

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

# ============================================================================
# 2. FLASK WSGI MIDDLEWARE HOOK ADAPTER
# ============================================================================
def register_flask_shield(app: Any, cwd: Optional[str] = None):
    jin_json = load_jin_json(cwd)

    @app.before_request
    def flask_shield_handler():
        # Avoid importing Flask unless active to avoid global dependency crash
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
            return None # Pass request through

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
        return None # Verification passed

# ============================================================================
# 3. DJANGO MIDDLEWARE ADAPTER
# ============================================================================
class JinShieldDjangoMiddleware:
    """
    Standard synchronous/asynchronous Django middleware class handling request/response lifecycles.
    """
    def __init__(self, get_response):
        self.get_response = get_response
        self.cwd = os.getcwd()
        self.jin_json = load_jin_json(self.cwd)
        # Check if the next middleware is async
        self._is_coroutine = asyncio.iscoroutinefunction(get_response)

    def __call__(self, request):
        if self._is_coroutine:
            return self.__call_async(request)
        return self.__call_sync(request)

    def __call_sync(self, request):
        # Avoid importing Django unless active
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
