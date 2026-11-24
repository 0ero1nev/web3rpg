import logging
import re


_SECRET_PATTERNS = (
    re.compile(r"(?i)(authorization|api[_-]?key|token|secret)(\s*[:=]\s*)[^\s,}]+"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._~+\-/]+=*"),
)


class SecretRedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        for pattern in _SECRET_PATTERNS:
            message = pattern.sub(lambda match: f"{match.group(1)}{match.group(2)}<redacted>" if len(match.groups()) == 2 else "Bearer <redacted>", message)
        record.msg = message
        record.args = ()
        return True


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.addFilter(SecretRedactingFilter())
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())
