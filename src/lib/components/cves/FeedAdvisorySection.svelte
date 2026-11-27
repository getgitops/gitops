<!--
  Datos del feed de CVEs en el detalle de un CVE: tecnologías que sigue la organización, rangos
  afectados, versiones corregidas, KEV, EPSS y enlaces a NVD / OSV / CISA KEV.
-->
<script lang="ts">
  import { ExternalLink, Flame } from '@lucide/svelte';
  import { KEV_CATALOG_URL, nvdUrl, osvUrl } from '#lib/cves/feed-view';
  import { _, locale } from '#lib/i18n';
  import type { CveAdvisory, ScanRef } from '#modules/cve-feed';

  let {
    advisory,
    technologies,
    affectsMe,
    occurrences = [],
    serviceHref,
  }: {
    advisory: CveAdvisory;
    technologies: { id: string; name: string }[];
    affectsMe: boolean;
    /** Services whose latest scans report this CVE (only the projects the user can see). */
    occurrences?: ScanRef[];
    serviceHref?: (service: ScanRef) => string;
  } = $props();

  const nvd = $derived(nvdUrl(advisory.id));
  const links = $derived(
    [
      nvd ? { label: 'NVD', href: nvd } : null,
      { label: 'OSV', href: osvUrl(advisory) },
      advisory.kev ? { label: 'CISA KEV', href: KEV_CATALOG_URL } : null,
    ].filter((link): link is { label: string; href: string } => link !== null),
  );

  function date(iso: string | null) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat($locale ?? 'es', { dateStyle: 'medium' }).format(new Date(iso));
  }
</script>

<section class="k-card overflow-hidden" aria-labelledby="cve-feed-data" data-testid="cve-feed-data">
  <div class="flex flex-wrap items-center gap-2 border-b border-white/8 px-5 py-4">
    <div class="mr-auto">
      <h2 id="cve-feed-data" class="font-semibold text-white">
        {$_('org.cves.feed.detail.title')}
      </h2>
      <p class="text-xs text-fg-subtle">{$_('org.cves.feed.detail.description')}</p>
    </div>
    {#if advisory.kev}
      <span class="k-badge k-badge-danger"
        ><Flame class="h-3 w-3" />{$_('org.cves.feed.badges.kev')}
        {#if advisory.kevAddedAt}· {date(advisory.kevAddedAt)}{/if}</span
      >
    {/if}
    {#if affectsMe}
      <span class="k-badge k-badge-warn">{$_('org.cves.feed.badges.affectsMe')}</span>
    {/if}
  </div>

  <dl class="space-y-4 px-5 py-4 text-sm">
    {#if technologies.length > 0}
      <div>
        <dt class="text-fg-muted">{$_('org.cves.feed.detail.technologies')}</dt>
        <dd class="mt-1.5 flex flex-wrap gap-1.5">
          {#each technologies as technology (technology.id)}
            <span class="k-badge">{technology.name}</span>
          {/each}
        </dd>
      </div>
    {/if}

    {#if occurrences.length > 0}
      <div data-testid="cve-feed-occurrences">
        <dt class="text-fg-muted">{$_('org.cves.feed.detail.occurrences')}</dt>
        <dd class="mt-1.5">
          <ul class="divide-y divide-white/6 rounded-xl border border-white/8">
            {#each occurrences as service (service.serviceId)}
              <li class="flex flex-wrap items-center gap-x-3 px-3 py-2 text-xs">
                <span class="text-fg-subtle">{service.projectName}</span>
                {#if serviceHref}
                  <a class="text-white hover:text-brand-300" href={serviceHref(service)}
                    >{service.serviceName}</a
                  >
                {:else}
                  <span class="text-white">{service.serviceName}</span>
                {/if}
              </li>
            {/each}
          </ul>
        </dd>
      </div>
    {/if}

    <div>
      <dt class="text-fg-muted">{$_('org.cves.feed.detail.affected')}</dt>
      <dd class="mt-1.5">
        {#if advisory.affected.length > 0}
          <ul class="divide-y divide-white/6 rounded-xl border border-white/8">
            {#each advisory.affected as item, index (index)}
              <li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                <span class="min-w-0 flex-1 truncate font-mono text-xs text-white">
                  {item.package ?? item.cpe ?? item.technologyId}
                  {#if item.ecosystem}<span class="text-fg-subtle">({item.ecosystem})</span>{/if}
                </span>
                <span class="font-mono text-xs text-red-300">
                  {item.ranges.length > 0 ? item.ranges.join(' · ') : '—'}
                </span>
                <span class="font-mono text-xs">
                  {#if item.fixedVersions.length > 0}
                    <span class="text-fg-subtle">→</span>
                    <span class="text-ok">{item.fixedVersions.join(', ')}</span>
                  {:else}
                    <span class="text-fg-subtle">{$_('org.cves.feed.detail.noFix')}</span>
                  {/if}
                </span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-fg-subtle">{$_('org.cves.feed.detail.noRanges')}</p>
        {/if}
      </dd>
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      <div>
        <dt class="text-fg-muted">{$_('org.cves.feed.detail.fixedVersions')}</dt>
        <dd class="mt-1 font-mono text-xs">
          {#if advisory.fixedVersions.length > 0}
            <span class="text-ok">{advisory.fixedVersions.join(', ')}</span>
          {:else}
            <span class="text-fg-subtle">{$_('org.cves.feed.detail.noFix')}</span>
          {/if}
        </dd>
      </div>
      <div>
        <dt class="text-fg-muted">EPSS</dt>
        <dd class="mt-1 text-xs tabular-nums text-fg">
          {advisory.epssScore !== null ? `${(advisory.epssScore * 100).toFixed(2)} %` : '—'}
        </dd>
      </div>
      <div>
        <dt class="text-fg-muted">{$_('org.cves.feed.detail.sources')}</dt>
        <dd class="mt-1 text-xs uppercase text-fg">{advisory.sources.join(', ') || '—'}</dd>
      </div>
    </div>

    {#if advisory.aliases.length > 0}
      <div>
        <dt class="text-fg-muted">{$_('org.cves.feed.detail.aliases')}</dt>
        <dd class="mt-1.5 flex flex-wrap gap-1.5">
          {#each advisory.aliases as alias (alias)}<span class="k-badge font-mono">{alias}</span
            >{/each}
        </dd>
      </div>
    {/if}

    <div class="flex flex-wrap gap-2 border-t border-white/8 pt-4">
      {#each links as link (link.label)}
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer noopener"
          class="k-btn k-btn-secondary k-btn-sm"
        >
          <ExternalLink class="h-3.5 w-3.5" />{link.label}
        </a>
      {/each}
    </div>
  </dl>
</section>
