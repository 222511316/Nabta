"""Outgoing email: SMTP when NABTA_SMTP_HOST is set, otherwise printed for local testing."""

import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage

from app.config import Settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    body: str


class ConsoleEmailSender:
    """Development stand-in: prints the message so reset links can be followed locally."""

    def send(self, message: EmailMessage) -> None:
        rule = "=" * 72
        print(
            f"\n{rule}\nNabta email (console mode: NABTA_SMTP_HOST is not set)\n"
            f"To: {message.to}\nSubject: {message.subject}\n\n{message.body}\n{rule}\n",
            flush=True,
        )
        logger.info("Printed email to %s: %s", message.to, message.subject)


class SmtpEmailSender:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def send(self, message: EmailMessage) -> None:
        s = self.settings
        mime = MimeMessage()
        mime["From"] = s.smtp_from or s.smtp_user or "nabta@localhost"
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime.set_content(message.body)
        try:
            with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
                if s.smtp_starttls:
                    smtp.starttls()
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_password or "")
                smtp.send_message(mime)
        except (OSError, smtplib.SMTPException):
            # Runs after the response was sent, so the failure can only be logged.
            logger.exception("Could not send email to %s", message.to)


def email_sender_for(settings: Settings):
    return SmtpEmailSender(settings) if settings.smtp_host else ConsoleEmailSender()


def password_reset_email(to: str, link: str, minutes: int, language: str = "en") -> EmailMessage:
    """In the language of the screen the reset was asked from (US23: essential messages in both)."""
    if language == "ar":
        # Arabic counts 3–10 with the plural, other numbers (11–99, 60) with the singular.
        unit = "دقائق" if 3 <= minutes <= 10 else "دقيقة"
        body = (
            "مرحبًا،\n\n"
            "وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في نبتة.\n"
            f"اختر كلمة مرور جديدة من هنا (يعمل الرابط مرة واحدة، خلال {minutes} {unit}):\n\n"
            f"{link}\n\n"
            "إذا لم تطلب ذلك، فتجاهل هذه الرسالة؛ لن تتغير كلمة المرور.\n\n"
            "فريق نبتة\n"
        )
        return EmailMessage(to=to, subject="إعادة تعيين كلمة المرور في نبتة", body=body)
    body = (
        "Hello,\n\n"
        "We received a request to reset the password for your Nabta account.\n"
        f"Choose a new password here (the link works once, for {minutes} minutes):\n\n"
        f"{link}\n\n"
        "If you didn't ask for this, you can ignore this email; your password won't change.\n\n"
        "The Nabta team\n"
    )
    return EmailMessage(to=to, subject="Reset your Nabta password", body=body)
