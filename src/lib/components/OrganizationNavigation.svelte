<script lang="ts">
  export let organizationSlug = '';
  export let active: 'overview' | 'projects';
</script>

<nav class="overview-tabs" aria-label="Organization sections">
  <a href={`/org/${organizationSlug}/overview`} class:active={active === 'overview'}>Overview</a>
  <a href={`/org/${organizationSlug}/projects`} class:active={active === 'projects'}>Projects</a>
</nav>

<style>
  .overview-tabs {
    display: flex;
    height: 48px;
    align-items: flex-end;
    gap: 28px;
    margin-top: 5px;
    border-bottom: 1px solid #292b33;
  }

  .overview-tabs a {
    position: relative;
    display: flex;
    height: 42px;
    align-items: center;
    color: #6f7480;
    font-size: 15px;
  }

  .overview-tabs a:hover {
    color: #d3cfd5;
  }

  .overview-tabs a.active {
    color: #ff9a63;
  }

  .overview-tabs a.active::after {
    position: absolute;
    right: 0;
    bottom: -1px;
    left: 0;
    height: 1px;
    content: '';
    background: #f95d11;
    box-shadow: 0 -2px 8px rgb(249 93 17 / 0.35);
  }

  @media (max-width: 640px) {
    .overview-tabs {
      gap: 18px;
      overflow-x: auto;
    }
  }
</style>
