# backend/app/services/cache.py
import json
import redis
from app.config import settings

r = redis.from_url(settings.redis_url)

def cache_get(key: str):
    val = r.get(key)
    return json.loads(val) if val else None

def cache_set(key: str, value: dict, ttl_seconds: int = 900):
    r.set(key, json.dumps(value), ex=ttl_seconds)
