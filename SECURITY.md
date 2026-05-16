# Security Policy

## Supported Versions

Security fixes target the default branch until the project starts publishing versioned releases.

## Reporting a Vulnerability

Please do not open public issues for suspected vulnerabilities. Report them privately through GitHub Security Advisories for this repository.

Include:

- Affected version or commit.
- Reproduction steps.
- Impact and affected component.
- Any logs or proof-of-concept details that are safe to share privately.

## Secrets

ClipSE requires local secrets for Better Auth, AI providers, and object storage. Never commit `.env` files or production credentials. If a secret is accidentally exposed, rotate it before publishing the repository.
