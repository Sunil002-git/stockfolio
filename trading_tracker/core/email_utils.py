"""
Email utility — reads SMTP config from DB (EmailConfig model).
Falls back to Django settings if no DB config exists.
"""
import random
import string
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def _get_config():
    """Return active EmailConfig or None."""
    try:
        from .models import EmailConfig
        return EmailConfig.objects.filter(is_active=True).first()
    except Exception:
        return None


def send_otp_email(to_email, otp_code, purpose='register'):
    """Send OTP email using DB-stored SMTP config."""
    cfg = _get_config()
    if not cfg:
        raise RuntimeError(
            "Email not configured. Please add SMTP settings in Settings → Email Configuration."
        )

    subject_map = {
        'register':        'Stockfolio — Verify your email',
        'forgot_password': 'Stockfolio — Password reset OTP',
    }
    purpose_label = {
        'register':        'complete your registration',
        'forgot_password': 'reset your password',
    }

    subject  = subject_map.get(purpose, 'Stockfolio OTP')
    label    = purpose_label.get(purpose, 'continue')

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;
                border:1px solid #e0e0e0;border-radius:12px;">
      <h2 style="color:#4d9fff;margin-bottom:4px;">Stockfolio</h2>
      <p style="color:#555;margin-top:0;">Your personal trading journal</p>
      <hr style="border:none;border-top:1px solid #eee;"/>
      <p>Use the OTP below to {label}. It expires in <strong>10 minutes</strong>.</p>
      <div style="font-size:2.2rem;font-weight:bold;letter-spacing:10px;
                  text-align:center;padding:20px;background:#f4f7ff;
                  border-radius:8px;color:#1a1a2e;margin:16px 0;">
        {otp_code}
      </div>
      <p style="color:#888;font-size:0.85rem;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
    """

    sender_name  = cfg.email_name or "Stockfolio"
    sender_addr  = cfg.from_email
    sender_full  = f"{sender_name} <{sender_addr}>"

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = sender_full
    msg['To']      = to_email
    msg.attach(MIMEText(html, 'html'))

    with smtplib.SMTP(cfg.host, cfg.port) as server:
        server.ehlo()
        server.starttls()
        server.login(cfg.from_email, cfg.password)
        server.sendmail(sender_addr, to_email, msg.as_string())


def generate_otp(length=6):
    return ''.join(random.choices(string.digits, k=length))
