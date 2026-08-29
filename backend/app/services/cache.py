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

def cache_delete_prefix(prefix: str):
    """Deletes every key starting with `prefix` — for keys like
    `repo_full:{id}:{days}` and `overview:{days}` where the days query
    param fans one logical cache entry out into several, so a plain
    `delete(key)` can't name them all. SCAN, not KEYS: KEYS blocks the
    whole Redis instance while it walks the keyspace; SCAN does the same
    walk in small non-blocking steps, which matters once this shares a
    Redis instance with anything latency-sensitive."""
    for key in r.scan_iter(f"{prefix}*"):
        r.delete(key)
