# Security Policy

GitOps is an open source project and security reports are welcome.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private security advisory flow for the repository, or contact the maintainers through the private channel listed in the repository's Security tab.

Include:

- A clear description of the impact.
- Affected versions or commit.
- Reproduction steps or a proof of concept that does not expose real data.
- Any suggested mitigation.

Please allow maintainers reasonable time to investigate before public disclosure. Do not test against systems or data that you do not own or have permission to access.

## Deployment cautions

- Use a long, random `GITDB_ENCRYPTION_KEY` and keep it out of source control.
- Protect the Git repository used by gitdb and its deploy credentials.
- Treat S3/GCS credentials, API keys, session secrets, and `.env` files as sensitive.
- Do not use the development value from `.env.example` in production.
- Review access control changes carefully; role and organization permissions affect data visibility.

## Supported versions

The latest development branch receives security fixes. Older releases may not receive backports unless a release explicitly states otherwise.
