<script lang="ts">
  import { ArrowUpRight, Package, Terminal } from '@lucide/svelte';

  const DOCS_BASE = 'https://getgitops.com/docs/vault/integrations';

  type Integration = {
    id: string;
    name: string;
    description: string;
    logo?: string;
    icon?: typeof Terminal;
  };

  const frameworks: Integration[] = [
    {
      id: 'express',
      name: 'Express',
      description: 'Carga los secretos en el arranque de tu servidor Express.',
      logo: '/integrations/express.svg',
    },
    {
      id: 'nestjs',
      name: 'NestJS',
      description: 'Integra el vault con el ConfigModule de NestJS.',
      logo: '/integrations/nestjs.svg',
    },
    {
      id: 'nextjs',
      name: 'Next.js',
      description: 'Inyecta las variables de entorno en build y runtime.',
      logo: '/integrations/nextjs.svg',
    },
    {
      id: 'nuxt',
      name: 'Nuxt',
      description: 'Resuelve el runtimeConfig de Nuxt desde el vault.',
      logo: '/integrations/nuxt.svg',
    },
    {
      id: 'react',
      name: 'React',
      description: 'Genera el .env de tu app React antes del build.',
      logo: '/integrations/react.svg',
    },
    {
      id: 'remix',
      name: 'Remix',
      description: 'Carga los secretos del servidor Remix por entorno.',
      logo: '/integrations/remix.svg',
    },
    {
      id: 'sveltekit',
      name: 'SvelteKit',
      description: 'Alimenta $app/env/private con el vault.',
      logo: '/integrations/sveltekit.svg',
    },
    {
      id: 'vite',
      name: 'Vite',
      description: 'Expone las variables del vault al dev server de Vite.',
      logo: '/integrations/vite.svg',
    },
    {
      id: 'django',
      name: 'Django',
      description: 'Lee los settings de Django desde el vault.',
      logo: '/integrations/django.svg',
    },
    {
      id: 'flask',
      name: 'Flask',
      description: 'Configura tu app Flask con los secretos del proyecto.',
      logo: '/integrations/flask.svg',
    },
    {
      id: 'dotnet',
      name: '.NET',
      description: 'Añade el vault como configuration provider en .NET.',
      logo: '/integrations/dotnet.svg',
    },
    {
      id: 'cli',
      name: 'CLI',
      description: 'Exporta e inyecta secretos desde la CLI de GitOps.',
      icon: Terminal,
    },
    {
      id: 'sdk',
      name: 'SDK',
      description: 'Consume el vault desde tu código con el SDK oficial.',
      icon: Package,
    },
  ];

  const cicd: Integration[] = [
    {
      id: 'github-actions',
      name: 'GitHub Actions',
      description: 'Inyecta los secretos del vault en tus workflows de GitHub.',
      logo: '/integrations/githubactions.svg',
    },
    {
      id: 'bitbucket',
      name: 'Bitbucket',
      description: 'Usa el vault desde Bitbucket Pipelines.',
      logo: '/integrations/bitbucket.svg',
    },
    {
      id: 'gitlab',
      name: 'GitLab',
      description: 'Resuelve las variables de tu pipeline de GitLab CI.',
      logo: '/integrations/gitlab.svg',
    },
    {
      id: 'jenkins',
      name: 'Jenkins',
      description: 'Carga los secretos en tus jobs y pipelines de Jenkins.',
      logo: '/integrations/jenkins.svg',
    },
  ];

  const sections: { id: string; title: string; description: string; items: Integration[] }[] = [
    {
      id: 'frameworks',
      title: 'Frameworks',
      description: 'Guías de integración para frameworks, la CLI y el SDK.',
      items: frameworks,
    },
    {
      id: 'cicd',
      title: 'CI/CD',
      description: 'Consume los secretos del vault desde tus pipelines.',
      items: cicd,
    },
  ];
</script>

<svelte:head>
  <title>Integraciones del vault - GitOps</title>
</svelte:head>

<div class="space-y-6">
  <header class="max-w-2xl">
    <h1 class="text-2xl font-semibold tracking-tight text-white">Integraciones</h1>
    <p class="mt-1 text-sm text-fg-muted">
      Conecta el vault de este proyecto con tu stack. Cada guía explica cómo cargar los secretos por
      entorno sin escribirlos en el repositorio.
    </p>
  </header>

  {#each sections as section (section.id)}
    <section aria-labelledby="integraciones-{section.id}">
      <div class="mb-3">
        <h2 id="integraciones-{section.id}" class="font-semibold text-white">{section.title}</h2>
        <p class="mt-0.5 text-sm text-fg-muted">{section.description}</p>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {#each section.items as integration (integration.id)}
          <a
            href={`${DOCS_BASE}/${integration.id}`}
            target="_blank"
            rel="noopener noreferrer"
            class="k-card k-card-hover group flex h-full items-start gap-3 p-4"
          >
            <span
              class="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-ink-900"
            >
              {#if integration.logo}
                <img src={integration.logo} alt="" class="h-6 w-6" loading="lazy" />
              {:else if integration.icon}
                <integration.icon class="h-5 w-5 text-brand-400" />
              {/if}
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1 text-sm font-semibold text-white">
                {integration.name}
                <ArrowUpRight
                  class="h-3.5 w-3.5 text-fg-subtle transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-400"
                />
                <span class="sr-only">(se abre en una pestaña nueva)</span>
              </span>
              <span class="mt-1 block text-sm leading-5 text-fg-muted">
                {integration.description}
              </span>
            </span>
          </a>
        {/each}
      </div>
    </section>
  {/each}
</div>
