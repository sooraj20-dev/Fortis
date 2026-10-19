"""
Fortis Security Module
Provides password hashing, strength validation, constant-time verification,
sliding-window rate limiting, and account lockout management.
"""
import re
import time
import logging
import threading
from datetime import datetime, timezone
from typing import Optional, Tuple, Dict, List
from fastapi import Request

# Ensure passlib works with bcrypt >= 4.1.0 where __about__ was removed
import bcrypt
if not hasattr(bcrypt, "__about__"):
    class _BcryptAbout:
        __version__ = getattr(bcrypt, "__version__", "4.0.1")
    bcrypt.__about__ = _BcryptAbout()

from passlib.context import CryptContext

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Precomputed dummy hash to prevent timing attacks during login for non-existent users
# Generated dynamically at startup so it has exact bcrypt format and cost factor
DUMMY_PASSWORD_HASH = pwd_context.hash("fortis_dummy_timing_protection_value")

# Common insecure passwords to block
COMMON_WEAK_PASSWORDS = {
    "password", "password123", "password1234", "12345678", "123456789",
    "1234567890", "qwerty123", "admin123", "welcome123", "fortis123",
    "iloveyou", "monkey123", "dragon123", "master123", "letmein123"
}

GENERIC_WORDS = {"user", "admin", "demo", "account", "test"}

SPECIAL_CHAR_REGEX = re.compile(r"""[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]""")


def validate_password_strength(
    password: str,
    user_email: Optional[str] = None,
    user_name: Optional[str] = None
) -> Tuple[bool, Optional[str]]:
    """
    Validates password against OWASP recommended security standards:
    - Length between 8 characters and bcrypt's 72-byte input limit
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one number
    - At least one special symbol
    - Not in common weak passwords dictionary
    - Does not contain user's email local part or personal name
    """
    if not password or len(password) < 8:
        return False, "Password must be at least 8 characters long."

    if len(password.encode("utf-8")) > 72:
        return False, "Password must be no more than 72 UTF-8 bytes."

    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter (A-Z)."

    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter (a-z)."

    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one number (0-9)."

    if not SPECIAL_CHAR_REGEX.search(password):
        return False, "Password must contain at least one special character (!@#$%^&* etc.)."

    lower_pass = password.lower()

    if lower_pass in COMMON_WEAK_PASSWORDS:
        return False, "Password is too common and easily guessed. Please choose a more secure password."

    if user_email and "@" in user_email:
        email_prefix = user_email.split("@")[0].lower()
        if len(email_prefix) >= 4 and email_prefix not in GENERIC_WORDS and email_prefix in lower_pass:
            return False, "Password must not contain parts of your email address."

    if user_name:
        name_clean = user_name.strip().lower()
        parts = [p for p in re.split(r"\s+", name_clean) if len(p) >= 4 and p not in GENERIC_WORDS]
        for part in parts:
            if part in lower_pass:
                return False, "Password must not contain your name."

    return True, None


class InMemoryRateLimiter:
    """
    Thread-safe sliding-window rate limiter for brute-force mitigation.
    Tracks timestamped events per key and prunes expired records automatically.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self._records: Dict[str, List[float]] = {}
        self._last_cleanup = time.monotonic()

    def _cleanup_stale(self, max_window: float = 300.0):
        now = time.monotonic()
        if now - self._last_cleanup < 60.0:
            return
        keys_to_remove = []
        for k, timestamps in self._records.items():
            valid = [t for t in timestamps if now - t < max_window]
            if valid:
                self._records[k] = valid
            else:
                keys_to_remove.append(k)
        for k in keys_to_remove:
            self._records.pop(k, None)
        self._last_cleanup = now

    def is_allowed(self, key: str, max_attempts: int, window_seconds: int) -> Tuple[bool, int]:
        """
        Check if an attempt is allowed.
        Returns:
            (allowed: bool, retry_after: int)
        """
        now = time.monotonic()
        with self._lock:
            self._cleanup_stale(float(window_seconds))
            timestamps = self._records.get(key, [])
            cutoff = now - window_seconds
            timestamps = [t for t in timestamps if t > cutoff]

            if len(timestamps) >= max_attempts:
                # Calculate remaining seconds until oldest attempt in window expires
                oldest = timestamps[0]
                retry_after = max(1, int(cutoff + window_seconds - oldest) + 1)
                self._records[key] = timestamps
                return False, retry_after

            timestamps.append(now)
            self._records[key] = timestamps
            return True, 0

    def reset(self, key: str):
        with self._lock:
            self._records.pop(key, None)


# Global rate limiter instance
auth_rate_limiter = InMemoryRateLimiter()


def get_client_ip(request: Request) -> str:
    """Use the ASGI-resolved client address; raw forwarding headers are untrusted."""
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


def is_account_locked(locked_until: Optional[datetime]) -> Tuple[bool, int]:
    """
    Check if an account is locked.
    Handles naive vs aware datetimes safely.
    Returns:
        (locked: bool, remaining_seconds: int)
    """
    if not locked_until:
        return False, 0
    now = datetime.now(timezone.utc)
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)

    if locked_until > now:
        remaining = int((locked_until - now).total_seconds())
        return True, max(1, remaining)
    return False, 0
