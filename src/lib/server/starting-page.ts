// Served straight from hooks.server.ts while startup (GitDB clone, auth, bootstrap detection) is
// still running or has failed. It is deliberately self-contained HTML: the root layout loads
// organizations, projects and permissions from GitDB, which is exactly what isn't available yet.

export type StartingPageState = 'starting' | 'failed';

type Locale = 'es' | 'en';

const HINT: Record<Locale, string> = {
  es: 'No hace falta que recargues.',
  en: 'No need to reload.',
};

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

export function renderStartingPage(
  state: StartingPageState,
  acceptLanguage: string | null,
  favicons = '',
) {
  const locale = pickLocale(acceptLanguage);
  const { title, body } = COPY[locale][state];
  const hint = HINT[locale];
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
${favicons}
<title>${title}</title>
${poll}
<style>
  /* mismos tokens que src/lib/styles/brand.css: aquí no se puede cargar el CSS de la app */
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
    background:
      radial-gradient(ellipse 60% 45% at 50% 0%, rgba(249, 93, 17, 0.16), transparent 70%),
      #0a0a0d;
    color: #e7e7ea;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  main {
    width: 100%; max-width: 400px; text-align: center; padding: 40px 28px;
    border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px;
    background: rgba(255, 255, 255, 0.02);
    box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.6);
  }
  .brand { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: #fff; }
  .brand span { color: #f95d11; }
  h1 { margin: 24px 0 8px; font-size: 18px; font-weight: 600; color: #fff; }
  p { margin: 0; font-size: 14px; line-height: 1.6; color: #a9a9b3; }
  .spinner {
    width: 36px; height: 36px; margin: 28px auto 0; border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.08); border-top-color: #f95d11;
    animation: spin 0.9s linear infinite;
  }
  .error {
    width: 40px; height: 40px; margin: 28px auto 0; border-radius: 50%;
    background: rgba(239, 68, 68, 0.12); color: #f87171; font-weight: 700; line-height: 40px;
  }
  .hint { margin-top: 20px; font-size: 12px; color: #72727e; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 3s; } }
</style>
</head>
<body>
<main role="status" aria-live="polite">
  <div class="brand">Git<span>Ops</span></div>
  ${starting ? '<div class="spinner" aria-hidden="true"></div>' : '<div class="error" aria-hidden="true">!</div>'}
  <h1>${title}</h1>
  <p>${body}</p>
  ${starting ? `<p class="hint">${hint}</p>` : ''}
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
