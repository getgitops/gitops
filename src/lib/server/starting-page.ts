// Served straight from hooks.server.ts while startup (GitDB clone, auth, bootstrap detection) is
// still running or has failed. It is deliberately self-contained HTML: the root layout loads
// organizations, projects and permissions from GitDB, which is exactly what isn't available yet.

export type StartingPageState = 'starting' | 'failed';

type Locale = 'es' | 'en';

const COPY: Record<Locale, Record<StartingPageState, { title: string; body: string }>> = {
  es: {
    starting: {
      title: 'GitOps está arrancando',
      body: 'Estamos sincronizando el repositorio de datos. La página se recargará sola en cuanto esté lista.',
    },
    failed: {
      title: 'GitOps no ha podido arrancar',
      body: 'El servidor no ha completado el arranque. Revisa los logs o contacta con un administrador del cluster.',
    },
  },
  en: {
    starting: {
      title: 'GitOps is starting',
      body: 'We are syncing the data repository. This page will reload on its own as soon as it is ready.',
    },
    failed: {
      title: 'GitOps failed to start',
      body: 'The server did not finish starting up. Check the logs or contact a cluster administrator.',
    },
  },
};

const RETRY_AFTER_SECONDS = 3;

function pickLocale(acceptLanguage: string | null): Locale {
  const first = (acceptLanguage ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('en') ? 'en' : 'es';
}

export function renderStartingPage(state: StartingPageState, acceptLanguage: string | null) {
  const locale = pickLocale(acceptLanguage);
  const { title, body } = COPY[locale][state];
  const starting = state === 'starting';

  // while starting, poll /health (200 once ready) and reload the original URL; <noscript> falls
  // back to a meta refresh. A failed startup won't recover on its own, so it doesn't poll.
  const poll = starting
    ? `<noscript><meta http-equiv="refresh" content="${RETRY_AFTER_SECONDS}"></noscript>
<script>
  (function poll() {
    fetch('/health', { cache: 'no-store' })
      .then(function (r) { if (r.ok) location.reload(); else setTimeout(poll, 1500); })
      .catch(function () { setTimeout(poll, 1500); });
  })();
</script>`
    : '';

  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
${poll}
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
    background: #020813; color: #e2e8f0;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  main {
    width: 100%; max-width: 420px; text-align: center; padding: 40px 28px;
    border: 1px solid #142236; border-radius: 20px; background: #06101f;
  }
  .brand { font-size: 12px; font-weight: 600; letter-spacing: 0.24em; text-transform: uppercase; color: #647189; }
  h1 { margin: 20px 0 8px; font-size: 20px; font-weight: 600; color: #fff; }
  p { margin: 0; font-size: 14px; line-height: 1.6; color: #94a3b8; }
  .spinner {
    width: 36px; height: 36px; margin: 28px auto 0; border-radius: 50%;
    border: 3px solid #142236; border-top-color: #38bdf8; animation: spin 0.9s linear infinite;
  }
  .error { width: 36px; height: 36px; margin: 28px auto 0; border-radius: 50%; background: #7f1d1d;
    color: #fecaca; font-weight: 700; line-height: 36px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 3s; } }
</style>
</head>
<body>
<main role="status" aria-live="polite">
  <div class="brand">GitOps</div>
  ${starting ? '<div class="spinner" aria-hidden="true"></div>' : '<div class="error" aria-hidden="true">!</div>'}
  <h1>${title}</h1>
  <p>${body}</p>
</main>
</body>
</html>`;

  return new Response(html, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...(starting ? { 'retry-after': String(RETRY_AFTER_SECONDS) } : {}),
    },
  });
}
