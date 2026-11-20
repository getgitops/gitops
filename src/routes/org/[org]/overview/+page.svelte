<script lang="ts">
  import { createPageStore } from '#lib/page-store';
  import {
    ArrowRight,
    Box,
    Check,
    ChevronRight,
    CircleDot,
    GitBranch,
    KeyRound,
    Plus,
    Rocket,
    Settings,
    ShieldCheck,
    TriangleAlert,
  } from '@lucide/svelte';
  import { _ } from '#lib/i18n';

  type ProjectRow = {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    status: 'active' | 'inactive';
    createdAt: string;
    updatedAt: string;
  };

  type ProjectDisplay = ProjectRow & {
    services: number;
    coverage: number;
    members: string[];
    state: 'Active' | 'Scanning';
    chart: number[];
  };

  export let data: {
    projects: ProjectRow[];
    organization?: { slug?: string | null; name?: string | null };
  };

  const projectDefaults = [
    { services: 8, coverage: 94, members: ['JS', 'AK', 'MR'], chart: [9, 6, 8, 7, 7, 3] },
    { services: 5, coverage: 89, members: ['JS', 'LM'], chart: [9, 6, 5, 7, 4, 3] },
    { services: 6, coverage: 92, members: ['AK', 'RM', 'TN'], chart: [9, 5, 6, 3, 5, 2] },
    { services: 5, coverage: 93, members: ['LM', 'RK', 'JS'], chart: [8, 5, 7, 4, 6, 3] },
  ];

  const mockedProjects: ProjectRow[] = [
    {
      id: 'mock-core',
      name: 'Core Platform',
      slug: 'core-platform',
      description: 'Platform infrastructure and shared runtime services.',
      status: 'active',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'mock-data',
      name: 'Data Pipeline',
      slug: 'data-pipeline',
      description: 'Managed data processing and event delivery.',
      status: 'active',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'mock-billing',
      name: 'Billing API',
      slug: 'billing-api',
      description: 'Subscription and payment services.',
      status: 'active',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'mock-web',
      name: 'Frontend Web',
      slug: 'frontend-web',
      description: 'Customer-facing web application.',
      status: 'active',
      createdAt: '',
      updatedAt: '',
    },
  ];

  const recentScans = [
    {
      date: 'Mar 12, 2025 · 14:32',
      project: 'main',
      hash: 'a1b2c3d',
      result: 'Success',
      tone: 'success',
    },
    {
      date: 'Mar 5, 2025 · 14:21',
      project: 'main',
      hash: '9f8e7d6',
      result: 'Success',
      tone: 'success',
    },
    {
      date: 'Feb 26, 2025 · 13:47',
      project: 'main',
      hash: '7c6b5a4',
      result: '2 issues',
      tone: 'warning',
    },
  ];

  const activity = [
    { user: 'Jane Smith', action: 'deployed state-iac', target: 'production', time: '12m ago' },
    { user: 'Jane Smith', action: 'scanned billing-api', target: '', time: '1h ago' },
    { user: 'Alex Kim', action: 'added vault secret', target: '', time: '2h ago' },
  ];

  $: orgSlug = data.organization?.slug ?? $page?.params?.org ?? '';
  $: sourceProjects = data.projects.length > 0 ? data.projects : mockedProjects;
  $: displayProjects = sourceProjects.map((project, index) => ({
    ...project,
    ...projectDefaults[index % projectDefaults.length],
    state: index === 1 ? 'Scanning' : 'Active',
  })) as ProjectDisplay[];

  function chartPoints(values: number[]) {
    return values.map((value, index) => `${index * 24 + 2},${value * 2 + 2}`).join(' ');
  }

  const page = createPageStore();
</script>

<svelte:head>
  <title>{$_('org.overview.title')} - GitOps</title>
</svelte:head>

<div class="overview-page">
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <a href="/org">Organizations</a>
    <ChevronRight class="h-3 w-3" />
    <span>{data.organization?.name ?? 'Acme Engineering'}</span>
  </nav>

  <header class="overview-header">
    <div class="page-title">
      <div class="page-symbol"><Rocket class="h-5 w-5" /></div>
      <div>
        <h1>{data.organization?.name ?? 'Acme Engineering'}</h1>
        <p>
          Centralized security, infrastructure state, and secret management for your organization
        </p>
      </div>
    </div>

    <style>
      .overview-page {
        width: 100%;
        max-width: 1240px;
        margin: 0 auto;
      }

      .breadcrumbs {
        display: flex;
        height: 12px;
        align-items: center;
        gap: 7px;
        color: #595e6a;
        font-size: 9px;
      }

      .breadcrumbs a {
        color: #595e6a;
      }

      .breadcrumbs span {
        color: #9da0aa;
      }

      .overview-header {
        display: flex;
        min-height: 72px;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        margin-top: 10px;
      }

      .page-title {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .page-symbol {
        display: flex;
        width: 42px;
        height: 42px;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        border: 1px solid #49356d;
        border-radius: 12px;
        background: radial-gradient(circle at 35% 30%, #5a3c91, #251d39 72%);
        color: #c7a2ff;
        box-shadow: inset 0 0 20px rgb(148 91 255 / 0.12);
      }

      h1 {
        color: #ececf0;
        font-size: 20px;
        font-weight: 570;
        letter-spacing: -0.45px;
        line-height: 1.25;
      }

      .page-title p {
        margin-top: 4px;
        color: #737985;
        font-size: 10px;
      }

      .page-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .button-primary,
      .button-secondary {
        display: inline-flex;
        height: 32px;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 0 12px;
        border-radius: 6px;
        font-size: 10px;
        font-weight: 550;
      }

      .button-primary {
        border: 1px solid #f95d11;
        background: linear-gradient(180deg, #ff7430, #e74d08);
        color: #fff;
        box-shadow: 0 5px 18px rgb(93 51 182 / 0.2);
      }

      .button-secondary {
        border: 1px solid #292b33;
        background: #17181e;
        color: #b2b6c0;
      }

      .overview-tabs {
        display: flex;
        height: 42px;
        align-items: flex-end;
        gap: 27px;
        margin-top: 5px;
        border-bottom: 1px solid #292b33;
      }

      .overview-tabs a {
        position: relative;
        display: flex;
        height: 36px;
        align-items: center;
        color: #6f7480;
        font-size: 10px;
      }

      .overview-tabs a.active {
        color: #c9cbd2;
      }

      .overview-tabs a.active::after {
        position: absolute;
        right: 0;
        bottom: -1px;
        left: 0;
        height: 1px;
        content: '';
        background: #9b6aff;
        box-shadow: 0 -2px 8px rgb(249 93 17 / 0.4);
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 14px;
      }

      .metric-card {
        position: relative;
        display: flex;
        height: 78px;
        align-items: center;
        justify-content: space-between;
        overflow: hidden;
        padding: 0 15px;
        border: 1px solid #292c35;
        border-radius: 8px;
        background: linear-gradient(135deg, #191a21, #15161b);
      }

      .metric-card > div:first-child {
        display: flex;
        flex-direction: column;
      }

      .metric-card span {
        color: #858a95;
        font-size: 9px;
      }

      .metric-card strong {
        margin-top: 4px;
        color: #e7e8ed;
        font-size: 22px;
        font-weight: 550;
        letter-spacing: -0.7px;
      }

      .metric-art {
        position: relative;
        width: 62px;
        height: 48px;
      }

      .project-art span {
        position: absolute;
        width: 34px;
        height: 34px;
        border: 1px solid #5a447f;
        border-radius: 8px;
        background: linear-gradient(135deg, #352744, #1e1929);
        transform: rotate(30deg);
      }

      .project-art span:nth-child(1) {
        top: 10px;
        left: 3px;
      }

      .project-art span:nth-child(2) {
        top: 6px;
        left: 14px;
      }

      .project-art span:nth-child(3) {
        top: 2px;
        left: 25px;
        border-color: #8e6bc5;
      }

      .services-art {
        display: flex;
        align-items: flex-end;
        gap: 5px;
        width: 58px;
        height: 42px;
        padding: 5px 0;
      }

      .services-art i {
        display: block;
        width: 9px;
        border-radius: 3px 3px 1px 1px;
        background: linear-gradient(#ff8a4c, #9c3410);
      }

      .services-art i:nth-child(1) {
        height: 18px;
      }

      .services-art i:nth-child(2) {
        height: 30px;
      }

      .services-art i:nth-child(3) {
        height: 23px;
      }

      .metric-icon {
        opacity: 0.62;
      }

      .score-ring {
        display: flex;
        width: 44px;
        height: 44px;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: conic-gradient(#55cf9b 0 92%, #2c3139 92%);
      }

      .score-ring::before {
        position: absolute;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        content: '';
        background: #17191e;
      }

      .score-ring span {
        z-index: 1;
        color: #9aa49f;
        font-size: 8px;
      }

      .overview-grid {
        display: grid;
        grid-template-columns: minmax(0, 2.05fr) minmax(230px, 1fr) minmax(230px, 1fr);
        gap: 14px;
        margin-top: 14px;
      }

      .panel {
        overflow: hidden;
        border: 1px solid #292c34;
        border-radius: 8px;
        background: #15161b;
      }

      .panel-heading {
        display: flex;
        min-height: 43px;
        align-items: center;
        justify-content: space-between;
        padding: 0 13px;
      }

      .panel-heading h2 {
        color: #d9dbe1;
        font-size: 11px;
        font-weight: 540;
        letter-spacing: -0.15px;
      }

      .panel-heading a,
      .panel-heading button {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: #747985;
        font-size: 8px;
      }

      .active-projects {
        min-height: 425px;
      }

      .project-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 0 10px 12px;
      }

      .project-row {
        display: grid;
        min-height: 82px;
        grid-template-columns: 36px minmax(110px, 1fr) 122px 48px 14px;
        align-items: center;
        gap: 9px;
        padding: 0 10px;
        border: 1px solid #292b34;
        border-radius: 7px;
        background: #18191f;
        transition:
          border-color 0.15s ease,
          background 0.15s ease;
      }

      .project-row:hover {
        border-color: #41384f;
        background: #1a1b22;
      }

      .project-icon {
        display: flex;
        width: 34px;
        height: 34px;
        align-items: center;
        justify-content: center;
        border: 1px solid #5e397c;
        border-radius: 9px;
        background: linear-gradient(145deg, #37213e, #1e1828);
        color: #9e65c8;
      }

      .project-icon-1 {
        border-color: #355e6c;
        background: linear-gradient(145deg, #17333a, #172227);
        color: #5fabc0;
      }

      .project-icon-2 {
        border-color: #5e4935;
        background: linear-gradient(145deg, #362a1d, #211c18);
        color: #b58a52;
      }

      .project-icon-3 {
        border-color: #3f4d78;
        background: linear-gradient(145deg, #252e4b, #1a1d2c);
        color: #788ed2;
      }

      .project-name {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .project-name strong {
        overflow: hidden;
        color: #dcdde2;
        font-size: 11px;
        font-weight: 500;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .project-name span {
        padding: 2px 5px;
        border-radius: 999px;
        color: #5cc79a;
        font-size: 7px;
      }

      .project-name span.scanning {
        background: rgb(245 173 57 / 0.13);
        color: #d6a74f;
      }

      .project-details p {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 6px;
        overflow: hidden;
        color: #6f7580;
        font-size: 7.5px;
        white-space: nowrap;
      }

      .project-details p i {
        width: 2px;
        height: 2px;
        border-radius: 50%;
        background: #4e535e;
      }

      .sparkline {
        width: 122px;
        height: 30px;
      }

      .project-team {
        display: flex;
        justify-content: flex-end;
      }

      .project-team span {
        display: flex;
        width: 20px;
        height: 20px;
        align-items: center;
        justify-content: center;
        margin-left: -6px;
        border: 2px solid #18191f;
        border-radius: 50%;
        background: #67513f;
        color: #ece2db;
        font-size: 6px;
      }

      .project-team span.team-1 {
        background: #435f50;
      }

      .project-team span.team-2 {
        background: #66515f;
      }

      .center-column,
      .right-column {
        min-width: 0;
      }

      .access-panel {
        min-height: 425px;
      }

      .quick-products {
        padding: 0 12px 10px;
      }

      .quick-product {
        display: grid;
        grid-template-columns: 30px 1fr auto;
        align-items: center;
        gap: 8px;
        min-height: 61px;
      }

      .quick-icon {
        display: flex;
        width: 28px;
        height: 28px;
        align-items: center;
        justify-content: center;
        border-radius: 7px;
        background: rgb(80 174 139 / 0.12);
        color: #4fc79a;
      }

      .quick-icon.violet {
        background: rgb(126 82 220 / 0.14);
        color: #ff8a4c;
      }

      .quick-icon.blue {
        background: rgb(78 102 205 / 0.13);
        color: #7287df;
      }

      .quick-product > div:nth-child(2) {
        display: flex;
        flex-direction: column;
      }

      .quick-product strong {
        color: #d4d6dd;
        font-size: 10px;
        font-weight: 500;
      }

      .quick-product small {
        margin-top: 3px;
        color: #626875;
        font-size: 8px;
      }

      .quick-product > span {
        padding: 3px 6px;
        border-radius: 999px;
        font-size: 6.5px;
      }

      .status-active,
      .status-synced {
        background: rgb(50 185 133 / 0.12);
        color: #52c89b;
      }

      .quick-product-stat {
        display: grid;
        min-height: 56px;
        grid-template-columns: 26px 1fr auto;
        align-items: center;
        gap: 5px;
        border-top: 1px solid #24262d;
        border-bottom: 1px solid #24262d;
      }

      .quick-product-stat span {
        color: #d8dae1;
        font-size: 17px;
        font-weight: 520;
      }

      .quick-product-stat i {
        color: #6f7580;
        font-size: 8px;
        font-style: normal;
      }

      .quick-product-stat b {
        color: #6e7480;
        font-size: 7px;
        font-weight: 400;
      }

      .right-column {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .recent-scans {
        height: 170px;
      }

      .timeline {
        padding: 0 13px;
      }

      .timeline article {
        position: relative;
        display: grid;
        min-height: 40px;
        grid-template-columns: 10px 1fr auto;
        align-items: start;
        gap: 7px;
      }

      .timeline article:not(:last-child)::after {
        position: absolute;
        top: 9px;
        bottom: -8px;
        left: 3px;
        width: 1px;
        content: '';
        background: #2b2d35;
      }

      .timeline-dot {
        z-index: 1;
        width: 7px;
        height: 7px;
        margin-top: 2px;
        border-radius: 50%;
        background: #4cc795;
        box-shadow: 0 0 0 3px #1a2621;
      }

      .timeline-dot.warning {
        background: #d99e3e;
        box-shadow: 0 0 0 3px #2b2418;
      }

      .timeline article strong {
        display: block;
        color: #a8acb5;
        font-size: 8px;
        font-weight: 450;
      }

      .timeline article p {
        margin-top: 2px;
        color: #595f6b;
        font-size: 7px;
      }

      .timeline article p i {
        margin: 0 3px;
        font-style: normal;
      }

      .scan-result {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 3px 5px;
        border-radius: 999px;
        background: rgb(59 181 131 / 0.12);
        color: #51bd91;
        font-size: 6px;
      }

      .scan-result.warning {
        background: rgb(217 158 62 / 0.12);
        color: #d8a146;
      }

      .activity-panel {
        min-height: 241px;
      }

      .activity-list {
        padding: 0 13px 10px;
      }

      .activity-list article {
        display: grid;
        min-height: 49px;
        grid-template-columns: 22px minmax(0, 1fr) auto;
        align-items: center;
        gap: 7px;
        border-bottom: 1px solid #24262d;
      }

      .activity-icon {
        display: flex;
        width: 22px;
        height: 22px;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        background: #24202d;
        color: #9c74d9;
      }

      .activity-1 {
        background: #1d2928;
        color: #50ad8e;
      }

      .activity-2 {
        background: #282318;
        color: #b88a45;
      }

      .activity-list p {
        overflow: hidden;
        color: #858a95;
        font-size: 7.5px;
        line-height: 1.5;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .activity-list p strong {
        color: #bfc2ca;
        font-weight: 450;
      }

      .activity-list p span {
        color: #956fce;
      }

      .activity-list time {
        color: #555a65;
        font-size: 6.5px;
      }

      .activity-list > a {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 5px;
        padding-top: 10px;
        color: #7c818c;
        font-size: 7px;
      }

      @media (max-width: 1180px) {
        .overview-grid {
          grid-template-columns: minmax(0, 1.6fr) minmax(220px, 1fr);
        }

        .right-column {
          display: grid;
          grid-column: 1 / -1;
          grid-template-columns: 1fr 1fr;
        }

        .project-row {
          grid-template-columns: 36px minmax(110px, 1fr) 90px 42px 14px;
        }

        .sparkline {
          width: 90px;
        }
      }

      @media (max-width: 900px) {
        .metric-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .overview-grid {
          grid-template-columns: 1fr;
        }

        .center-column,
        .right-column {
          grid-column: 1;
        }

        .right-column {
          grid-template-columns: 1fr 1fr;
        }
      }

      @media (max-width: 640px) {
        .overview-header {
          align-items: flex-start;
          flex-direction: column;
        }

        .page-actions {
          width: 100%;
        }

        .page-actions a {
          flex: 1;
        }

        .overview-tabs {
          gap: 18px;
          overflow-x: auto;
        }

        .metric-grid,
        .right-column {
          grid-template-columns: 1fr;
        }

        .project-row {
          grid-template-columns: 34px minmax(0, 1fr) 36px;
        }

        .sparkline,
        .project-team,
        .project-row > :last-child {
          display: none;
        }
      }

      @media (min-width: 901px) {
        .overview-page {
          max-width: 1320px;
        }

        .breadcrumbs {
          font-size: 14px;
        }

        .overview-header {
          min-height: 92px;
        }

        .page-title {
          gap: 14px;
        }

        .page-symbol {
          width: 50px;
          height: 50px;
        }

        h1 {
          font-size: 28px;
        }

        .page-title p {
          font-size: 15px;
        }

        .button-primary,
        .button-secondary {
          height: 40px;
          padding: 0 15px;
          font-size: 14px;
        }

        .overview-tabs {
          height: 48px;
        }

        .overview-tabs a {
          height: 42px;
          font-size: 15px;
        }

        .metric-grid {
          gap: 14px;
          margin-top: 18px;
        }

        .metric-card {
          height: 104px;
          padding: 0 19px;
        }

        .metric-card span {
          font-size: 14px;
        }

        .metric-card strong {
          font-size: 32px;
        }

        .score-ring {
          width: 54px;
          height: 54px;
        }

        .score-ring::before {
          width: 44px;
          height: 44px;
        }

        .overview-grid {
          gap: 16px;
          margin-top: 18px;
        }

        .panel-heading {
          min-height: 54px;
          padding: 0 16px;
        }

        .panel-heading h2 {
          font-size: 16px;
        }

        .panel-heading a,
        .panel-heading button {
          font-size: 14px;
        }

        .active-projects,
        .access-panel {
          min-height: 510px;
        }

        .project-list {
          gap: 10px;
          padding: 0 12px 15px;
        }

        .project-row {
          min-height: 100px;
          grid-template-columns: 42px minmax(130px, 1fr) 130px 58px 16px;
          gap: 11px;
          padding: 0 13px;
        }

        .project-icon {
          width: 42px;
          height: 42px;
        }

        .project-name strong {
          font-size: 16px;
        }

        .project-name span {
          font-size: 14px;
        }

        .project-details p {
          font-size: 14px;
        }

        .sparkline {
          width: 130px;
          height: 36px;
        }

        .project-team span {
          width: 24px;
          height: 24px;
          font-size: 14px;
        }

        .quick-products {
          padding: 0 16px 14px;
        }

        .quick-product {
          min-height: 74px;
          grid-template-columns: 36px 1fr auto;
          gap: 10px;
        }

        .quick-icon {
          width: 34px;
          height: 34px;
        }

        .quick-product strong {
          font-size: 15px;
        }

        .quick-product small,
        .quick-product-stat i {
          font-size: 14px;
        }

        .quick-product > span {
          font-size: 14px;
        }

        .quick-product-stat {
          min-height: 68px;
        }

        .quick-product-stat span {
          font-size: 24px;
        }

        .quick-product-stat b {
          font-size: 14px;
        }

        .recent-scans {
          height: 208px;
        }

        .timeline {
          padding: 0 16px;
        }

        .timeline article {
          min-height: 49px;
        }

        .timeline article strong {
          font-size: 14px;
        }

        .timeline article p {
          font-size: 14px;
        }

        .scan-result {
          font-size: 14px;
        }

        .activity-panel {
          min-height: 286px;
        }

        .activity-list {
          padding: 0 16px 14px;
        }

        .activity-list article {
          min-height: 60px;
          grid-template-columns: 28px minmax(0, 1fr) auto;
        }

        .activity-icon {
          width: 28px;
          height: 28px;
        }

        .activity-list p {
          font-size: 14px;
        }

        .activity-list time {
          font-size: 14px;
        }

        .activity-list > a {
          font-size: 14px;
        }
      }

      .breadcrumbs,
      .button-primary,
      .button-secondary,
      .overview-tabs a,
      .metric-card span,
      .panel-heading a,
      .panel-heading button,
      .project-name span,
      .project-details p,
      .project-team span,
      .quick-product small,
      .quick-product > span,
      .quick-product-stat i,
      .quick-product-stat b,
      .timeline article strong,
      .timeline article p,
      .scan-result,
      .activity-list p,
      .activity-list time,
      .activity-list > a {
        font-size: 14px;
      }

      .page-title p,
      .quick-product strong {
        font-size: 16px;
      }

      .page-symbol,
      .project-icon-1,
      .quick-icon.violet {
        border-color: rgb(249 93 17 / 0.26);
        background: linear-gradient(145deg, rgb(249 93 17 / 0.18), rgb(249 93 17 / 0.05));
        color: #ff8a4c;
      }

      .panel,
      .metric-card,
      .project-row {
        border-color: rgb(255 255 255 / 0.085);
        background-color: rgb(255 255 255 / 0.025);
      }

      .project-row:hover {
        border-color: rgb(249 93 17 / 0.28);
        background: rgb(255 255 255 / 0.04);
      }

      .button-primary {
        border-color: #f95d11;
        background: linear-gradient(180deg, #ff7430, #e74d08);
        box-shadow: 0 8px 24px rgb(249 93 17 / 0.18);
      }

      .overview-tabs a.active {
        color: #ff9a63;
      }

      .overview-tabs a.active::after {
        background: #f95d11;
        box-shadow: 0 -2px 8px rgb(249 93 17 / 0.35);
      }

      .project-name span.scanning,
      .scan-result.warning {
        background: rgb(249 93 17 / 0.12);
        color: #ff9a63;
      }

      .quick-product-stat {
        border-color: rgb(255 255 255 / 0.07);
      }
    </style>
    <div class="page-actions">
      <a href={`/org/${orgSlug}/settings/projects`} class="button-primary">
        <Plus class="h-4 w-4" /> New Project
      </a>
      <a href={`/org/${orgSlug}/settings/global`} class="button-secondary">
        <Settings class="h-4 w-4" /> Settings
      </a>
    </div>
  </header>

  <nav class="overview-tabs" aria-label="Organization sections">
    <a href={`/org/${orgSlug}/overview`} class="active">Overview</a>
    <a href={`/org/${orgSlug}/settings/projects`}>Projects</a>
    <a href={`/org/${orgSlug}/settings/access-control`}>Members</a>
    <a href={`/org/${orgSlug}/settings/global`}>Integrations</a>
    <a href={`/org/${orgSlug}/settings/global`}>Settings</a>
  </nav>

  <section class="metric-grid" aria-label="Organization metrics">
    <article class="metric-card">
      <div>
        <span>Total Projects</span>
        <strong>{displayProjects.length}</strong>
      </div>
      <div class="metric-art project-art" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
    </article>
    <article class="metric-card">
      <div>
        <span>Services Covered</span>
        <strong>42</strong>
      </div>
      <div class="metric-art services-art" aria-hidden="true"><i></i><i></i><i></i></div>
    </article>
    <article class="metric-card">
      <div>
        <span>Active Secrets / Vaults</span>
        <strong>158</strong>
      </div>
      <KeyRound class="metric-icon h-7 w-7 text-[#6244c4]" />
    </article>
    <article class="metric-card">
      <div>
        <span>Security Score</span>
        <strong>92%</strong>
      </div>
      <div class="score-ring" aria-label="92 percent"><span>92</span></div>
    </article>
  </section>

  <div class="overview-grid">
    <section class="panel active-projects">
      <header class="panel-heading">
        <div>
          <h2>Active Projects</h2>
        </div>
        <a href={`/org/${orgSlug}/settings/projects`}>
          View all <ArrowRight class="h-3 w-3" />
        </a>
      </header>

      <div class="project-list">
        {#each displayProjects.slice(0, 4) as project, index (project.id)}
          <a href={`/org/${orgSlug}/projects/${project.slug}/overview`} class="project-row">
            <div class={`project-icon project-icon-${index}`}><GitBranch class="h-5 w-5" /></div>
            <div class="project-details">
              <div class="project-name">
                <strong>{project.name}</strong>
                <span class:scanning={project.state === 'Scanning'}>
                  {project.state === 'Active' ? '' : 'Scanning'}
                </span>
              </div>
              <p>
                {project.services} services <i></i>
                {project.coverage}% coverage <i></i> Updated 2h ago
              </p>
            </div>
            <svg class="sparkline" viewBox="0 0 124 30" role="img" aria-label="Project activity">
              <defs>
                <linearGradient id={`spark-${index}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="#37ca8a" stop-opacity=".32" />
                  <stop offset="100%" stop-color="#37ca8a" stop-opacity="0" />
                </linearGradient>
              </defs>
              <polyline
                points={chartPoints(project.chart)}
                fill="none"
                stroke="#45c995"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <div class="project-team">
              {#each project.members.slice(0, 3) as member, memberIndex}
                <span class={`team-${memberIndex}`}>{member[0]}</span>
              {/each}
            </div>
            <ChevronRight class="h-3.5 w-3.5 text-[#555964]" />
          </a>
        {/each}
      </div>
    </section>

    <div class="center-column">
      <section class="panel access-panel">
        <header class="panel-heading"><h2>Product Quick Access / Status</h2></header>

        <div class="quick-products">
          <article class="quick-product">
            <div class="quick-icon"><ShieldCheck class="h-4 w-4" /></div>
            <div><strong>Vault</strong><small>Secrets stored</small></div>
            <span class="status-active">Active</span>
          </article>
          <div class="quick-product-stat">
            <span>158</span> <i>Secrets</i> <b>12m ago</b>
          </div>

          <article class="quick-product">
            <div class="quick-icon violet"><CircleDot class="h-4 w-4" /></div>
            <div><strong>Code Report</strong><small>Last scan</small></div>
            <span class="status-active">Scanning</span>
          </article>
          <div class="quick-product-stat">
            <span>12</span> <i>Critical</i> <b>Vulnerability trend</b>
          </div>

          <article class="quick-product">
            <div class="quick-icon blue"><Box class="h-4 w-4" /></div>
            <div><strong>State IaC</strong><small>Drift checks</small></div>
            <span class="status-synced">Synced</span>
          </article>
          <div class="quick-product-stat">
            <span>32</span> <i>Resources</i> <b>All synced</b>
          </div>
        </div>
      </section>
    </div>

    <div class="right-column">
      <section class="panel recent-scans">
        <header class="panel-heading">
          <h2>Recent scans</h2>
          <button type="button">View all <ArrowRight class="h-3 w-3" /></button>
        </header>
        <div class="timeline">
          {#each recentScans as scan}
            <article>
              <span class:warning={scan.tone === 'warning'} class="timeline-dot"></span>
              <div>
                <strong>{scan.date}</strong>
                <p>{scan.project} <i>·</i> {scan.hash}</p>
              </div>
              <span class:warning={scan.tone === 'warning'} class="scan-result">
                {#if scan.tone === 'success'}<Check class="h-3 w-3" />{:else}
                  <TriangleAlert class="h-3 w-3" />
                {/if}
                {scan.result}
              </span>
            </article>
          {/each}
        </div>
      </section>

      <section class="panel activity-panel">
        <header class="panel-heading"><h2>Recent Organization Activity</h2></header>
        <div class="activity-list">
          {#each activity as item, index}
            <article>
              <div class={`activity-icon activity-${index}`}>
                {#if index === 0}<Rocket class="h-3.5 w-3.5" />{:else if index === 1}
                  <ShieldCheck class="h-3.5 w-3.5" />{:else}<KeyRound class="h-3.5 w-3.5" />{/if}
              </div>
              <p><strong>{item.user}</strong> {item.action} <span>{item.target}</span></p>
              <time>{item.time}</time>
            </article>
          {/each}
          <a href={`/org/${orgSlug}/settings/audit`}>
            View full activity <ArrowRight class="h-3 w-3" />
          </a>
        </div>
      </section>
    </div>
  </div>
</div>
