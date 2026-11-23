<script lang="ts">
  import { FileDiff, History, ScrollText, UserSearch } from '@lucide/svelte';
  import { _ } from '#lib/i18n';
</script>

<svelte:head>
  <title>{$_('projectSettings.audit.title')} - {$_('projectSettings.title')}</title>
</svelte:head>

<!-- same "coming soon" layout as the organization settings (server keys, encryption) -->
<div class="coming-soon-page">
  <div class="coming-soon-icon"><ScrollText class="h-8 w-8" /></div>
  <span class="coming-soon-badge">{$_('common.comingSoon')}</span>
  <h2>{$_('projectSettings.audit.title')}</h2>
  <p>{$_('projectSettings.audit.comingSoonDescription')}</p>

  <div class="coming-soon-features">
    <div><History class="h-5 w-5" /><span>{$_('projectSettings.audit.featureHistory')}</span></div>
    <div><FileDiff class="h-5 w-5" /><span>{$_('projectSettings.audit.featureDiff')}</span></div>
    <div>
      <UserSearch class="h-5 w-5" /><span>{$_('projectSettings.audit.featureFilters')}</span>
    </div>
  </div>
</div>

<style>
  .coming-soon-page {
    display: flex;
    min-height: 420px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    padding: 48px 24px;
    border: 1px dashed rgb(255 255 255 / 0.11);
    border-radius: 14px;
    background:
      radial-gradient(45% 55% at 50% 0%, rgb(249 93 17 / 0.08), transparent 75%),
      rgb(255 255 255 / 0.018);
    text-align: center;
  }

  .coming-soon-icon {
    display: flex;
    width: 64px;
    height: 64px;
    align-items: center;
    justify-content: center;
    border: 1px solid rgb(249 93 17 / 0.22);
    border-radius: 17px;
    background: rgb(249 93 17 / 0.08);
    color: #ff8a4c;
  }

  .coming-soon-badge {
    margin-top: 18px;
    padding: 4px 9px;
    border: 1px solid rgb(249 93 17 / 0.18);
    border-radius: 999px;
    background: rgb(249 93 17 / 0.08);
    color: #e89a68;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin-top: 14px;
    color: #eeeaf0;
    font-size: 24px;
    font-weight: 600;
  }

  p {
    max-width: 600px;
    margin-top: 8px;
    color: #858089;
    font-size: 15px;
    line-height: 1.6;
  }

  .coming-soon-features {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-top: 28px;
  }

  .coming-soon-features div {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 13px;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: 9px;
    background: rgb(255 255 255 / 0.025);
    color: #aaa4ad;
    font-size: 13px;
  }
</style>
