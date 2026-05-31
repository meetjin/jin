import os
import re
import time
import json
import asyncio
from typing import Optional, Dict, Any, List
import httpx
import jwt
from jwt.algorithms import RSAAlgorithm
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse
from starlette.requests import Request
from starlette.types import ASGIApp

# Cache structures for rotated public keys
cached_keys: Optional[List[Dict[str, Any]]] = None
fetching_lock = asyncio.Lock()
JWKS_URL = "https://meetjin.com/.well-known/jwks.json"

# PyJWKClient cache
jwk_clients: Dict[str, jwt.PyJWKClient] = {}

def get_jwk_client(jwks_url: str = JWKS_URL) -> jwt.PyJWKClient:
    if jwks_url not in jwk_clients:
        jwk_clients[jwks_url] = jwt.PyJWKClient(jwks_url)
    return jwk_clients[jwks_url]

# In-memory atomic request statistics tracking
shield_stats = {
    "active_requests": 0,
    "total_requests": 0
}

async def get_jwks_keys(jwks_url: str = JWKS_URL) -> List[Dict[str, Any]]:
    """
    Fetch JWKS public keys from the central authority and cache them in memory.
    """
    global cached_keys
    if cached_keys is not None:
        return cached_keys

    async with fetching_lock:
        # Re-check key cache after acquiring lock
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

def match_path(endpoint_pattern: str, actual_path: str) -> bool:
    """
    Determine if an incoming actual request path matches a jin.json endpoint.
    Aligns both Express-style (:param) and FastAPI-style ({param}) path parameters.
    """
    norm_pattern = endpoint_pattern.rstrip('/') if endpoint_pattern != '/' else endpoint_pattern
    norm_actual = actual_path.rstrip('/') if actual_path != '/' else actual_path

    # 1. Convert FastAPI {param:path} (catch-all) to :param* style
    pattern = re.sub(r'\{(\w+):path\}', r':\1*', norm_pattern)
    # 2. Convert FastAPI {param:type} or standard {param} to :param style
    pattern = re.sub(r'\{(\w+)(?::\w+)?\}', r':\1', pattern)

    # 3. Escape regex special characters but preserve ':' and '*'
    escaped = re.escape(pattern)
    # Clean up escaped backslashes for colons and asterisks (varies by Python version)
    escaped = escaped.replace(r'\:', ':').replace(r'\*', '*')

    # 4. Convert :param* wildcard to (.*)
    escaped = re.sub(r':\w+\*', r'(.*)', escaped)
    # 5. Convert standard :param segment match to ([^/]+)
    escaped = re.sub(r':\w+', r'([^/]+)', escaped)

    regex_string = f"^{escaped}$"
    try:
        return bool(re.match(regex_string, norm_actual))
    except Exception:
        return False

def load_jin_json(cwd: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Scans standard project paths and parses the local jin.json definition file.
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

class JinShieldMiddleware(BaseHTTPMiddleware):
    """
    Zero-latency, in-memory ASGI Middleware protecting endpoints against rogue scrapers
    using local asymmetric cryptographic verification (RS256) of Jin Identity JWTs.
    """
    def __init__(
        self, 
        app: ASGIApp, 
        cwd: Optional[str] = None, 
        jwks_url: str = JWKS_URL
    ):
        super().__init__(app)
        self.cwd = cwd or os.getcwd()
        self.jwks_url = jwks_url
        self.jin_json = load_jin_json(self.cwd)
        
        if not self.jin_json:
            print("[Jin Shield] Warning: jin.json specification was not found. Shield is operating in validation-only mode.")
            
        # Trigger background key pre-fetch to warm cache during server startup
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(get_jwks_keys(self.jwks_url))
        except Exception:
            pass

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        # 1. Extract path and method
        req_path = request.url.path
        req_method = request.method.upper()

        # 2. Check if this request targets any endpoint registered in jin.json
        matched_intent = None
        if self.jin_json and "intents" in self.jin_json:
            for intent in self.jin_json["intents"]:
                intent_method = intent.get("method", "GET").upper()
                intent_endpoint = intent.get("endpoint", "")
                if intent_method == req_method and match_path(intent_endpoint, req_path):
                    matched_intent = intent
                    break

        # 3. Read Authorization Header
        auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
        has_jin_identity = isinstance(auth_header, str) and auth_header.startswith("Jin-Identity ")

        # 4. Bypassing check: If the request is NOT an agent request AND does NOT hit a protected route,
        # let it proceed normally (allowing browser/standard API traffic to bypass).
        if not matched_intent and not has_jin_identity:
            return await call_next(request)

        # Response generator for standard 403 boundary
        def create_forbidden_response(reason: str) -> JSONResponse:
            return JSONResponse(
                status_code=403,
                content={
                    "error": f"Access Denied. {reason}. Refer to protocol instructions at /.well-known/jin.json"
                }
            )

        if not has_jin_identity:
            return create_forbidden_response("Missing Authorization: Jin-Identity header")

        token = auth_header[len("Jin-Identity "):].strip()
        if not token:
            return create_forbidden_response("Empty identity token")

        try:
            # 5. Retrieve key and verify the token using PyJWKClient
            jwk_client = get_jwk_client(self.jwks_url)
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            
            try:
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["RS256"],
                    issuer="meetjin.com",
                    options={"verify_aud": False}
                )
            except jwt.ExpiredSignatureError:
                return create_forbidden_response("Identity passport has expired")
            except jwt.InvalidSignatureError:
                return create_forbidden_response("Invalid cryptographic passport signature")
            except jwt.InvalidIssuerError:
                return create_forbidden_response("Untrusted token issuer")
            except Exception as e:
                return create_forbidden_response(f"Cryptographic validation failed: {str(e)}")

            # 8. Check intent_id
            intent_id = payload.get("intent_id")
            if not intent_id:
                return create_forbidden_response("Missing intent_id claim in identity payload")

            if not matched_intent:
                return create_forbidden_response(
                    f"Endpoint {req_method} {req_path} is not declared in the project's jin.json protocol specification"
                )

            if intent_id != matched_intent.get("id"):
                return create_forbidden_response(
                    f"Identity passport is authorized for intent '{intent_id}', but requested endpoint requires intent '{matched_intent.get('id')}'"
                )

            # 9. Atomic tracking counts
            shield_stats["total_requests"] += 1
            shield_stats["active_requests"] += 1

            try:
                response = await call_next(request)
                return response
            finally:
                shield_stats["active_requests"] -= 1

        except Exception as e:
            return create_forbidden_response(f"Identity verification failed: {str(e)}")
