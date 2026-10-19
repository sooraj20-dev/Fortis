"""Minimal SMTP delivery for account-verification links."""
import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import urlencode

from app.config import settings


class EmailDeliveryError(RuntimeError):
    pass


def is_email_delivery_configured() -> bool:
    return bool(settings.SMTP_HOST.strip() and settings.SMTP_FROM_EMAIL.strip())


def send_verification_email(to_email: str, name: str, token: str) -> None:
    if not is_email_delivery_configured():
        raise EmailDeliveryError("Email delivery is not configured")
    verify_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/auth/login?{urlencode({'verify': token, 'tab': 'login'})}"
    message = EmailMessage()
    message["Subject"] = "Verify your FORTIS account"
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = to_email
    message.set_content(
        f"Hi {name},\n\nVerify your FORTIS email address using this one-time link (valid for "
        f"{settings.EMAIL_VERIFICATION_EXPIRE_MINUTES} minutes):\n\n{verify_url}\n\n"
        "If you did not create this account, you can ignore this message."
    )
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
            smtp.ehlo()
            if settings.SMTP_STARTTLS:
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
            if settings.SMTP_USERNAME:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise EmailDeliveryError("Unable to deliver verification email") from exc
