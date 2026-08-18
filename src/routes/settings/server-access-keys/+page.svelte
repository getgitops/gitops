<svelte:head>
  <title>Server Access Keys - Settings</title>
</svelte:head>

<div class="space-y-6">
  <section>
    <h3 class="text-xl font-semibold text-slate-900">Server Access Keys</h3>
    <p class="mt-2 text-sm text-slate-600">
      Manage machine-to-machine credentials for server integrations.
    </p>
  </section>

  <section class="rounded-md border border-slate-200 bg-slate-50 p-4">
    <ul class="space-y-2">
      <li>
        <a href="/settings/server-access-keys/oidc" class="text-sm font-medium text-blue-600 hover:underline">
          OIDC Providers
        </a>
        <p class="text-xs text-slate-500">
          Configure CI/CD OIDC providers (GitHub Actions, Bitbucket Pipelines, custom) for secretless authentication.
        </p>
      </li>
    </ul>
  </section>
</div>