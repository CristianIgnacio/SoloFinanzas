from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import HTTPException


class RateLimiter:
    def __init__(self):
        self.entries = defaultdict(deque)
        self.lock = Lock()

    def check(self, key: str, limit: int):
        now = monotonic()
        with self.lock:
            # Bound memory for unauthenticated IP keys.
            if len(self.entries) > 10000:
                self.entries = defaultdict(deque, {
                    k: v for k, v in self.entries.items() if v and v[-1] > now - 60
                })
                if len(self.entries) > 10000 and key not in self.entries:
                    raise HTTPException(429, "Servicio ocupado. Intenta más tarde.", headers={"Retry-After": "60"})
            values = self.entries[key]
            while values and values[0] <= now - 60:
                values.popleft()
            if len(values) >= limit:
                raise HTTPException(429, "Demasiadas solicitudes. Espera un minuto.", headers={"Retry-After": "60"})
            values.append(now)


limiter = RateLimiter()
