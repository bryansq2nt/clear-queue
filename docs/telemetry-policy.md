# Telemetry Policy

- `sendDefaultPii` is disabled in Sentry configs by default.
- Sampling is environment-based: high in development, reduced in production.
- Server-side event payloads redact direct user identifiers where available.
