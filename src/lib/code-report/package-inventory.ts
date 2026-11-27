// Which packages an analysis says a service uses, as `{ OSV ecosystem, name }`: from a Trivy report
// (`Results[].Packages[]` with `--list-all-pkgs`, else the packages of `Results[].Vulnerabilities[]`)
// or an SBOM (CycloneDX `components[]`, syft `artifacts[]`). Only language ecosystems that OSV
// knows; OS packages (deb, apk…) are left out.
import type { OsvEcosystem } from '#lib/cves/technologies.data';

export type InventoryPackage = { ecosystem: OsvEcosystem; name: string };

const PURL_ECOSYSTEMS: Record<string, OsvEcosystem> = {
  npm: 'npm',
  pypi: 'PyPI',
  golang: 'Go',
  maven: 'Maven',
  gem: 'RubyGems',
  cargo: 'crates.io',
  nuget: 'NuGet',
  composer: 'Packagist',
};

// Trivy `Results[].Type`
const TRIVY_ECOSYSTEMS: Record<string, OsvEcosystem> = {
  npm: 'npm',
  yarn: 'npm',
  pnpm: 'npm',
  bun: 'npm',
  'node-pkg': 'npm',
  pip: 'PyPI',
  pipenv: 'PyPI',
  poetry: 'PyPI',
  uv: 'PyPI',
  'python-pkg': 'PyPI',
  gomod: 'Go',
  gobinary: 'Go',
  jar: 'Maven',
  pom: 'Maven',
  gradle: 'Maven',
  sbt: 'Maven',
  bundler: 'RubyGems',
  gemspec: 'RubyGems',
  cargo: 'crates.io',
  'rust-binary': 'crates.io',
  nuget: 'NuGet',
  'dotnet-core': 'NuGet',
  composer: 'Packagist',
  'composer-vendor': 'Packagist',
};

function normalizeName(ecosystem: OsvEcosystem, name: string): string {
  // PEP 503: PyPI names are compared lower-case with runs of `-_.` as one dash
  return ecosystem === 'PyPI' ? name.toLowerCase().replace(/[-_.]+/g, '-') : name;
}

/** `pkg:npm/%40sveltejs/kit@2.0.0` -> `{ npm, @sveltejs/kit }`; `null` for anything else. */
export function parsePurl(purl: unknown): InventoryPackage | null {
  if (typeof purl !== 'string') return null;
  const match = /^pkg:([a-z]+)\/([^@?#]+)/i.exec(purl);
  const ecosystem = match ? PURL_ECOSYSTEMS[match[1].toLowerCase()] : undefined;
  if (!match || !ecosystem) return null;
  let path: string;
  try {
    path = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  const parts = path.split('/');
  const name =
    ecosystem === 'Maven' && parts.length >= 2
      ? `${parts.slice(0, -1).join('.')}:${parts[parts.length - 1]}`
      : path;
  return name ? { ecosystem, name: normalizeName(ecosystem, name) } : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function purlOf(entry: Record<string, unknown>): string | null {
  const identifier = record(entry.Identifier) ?? record(entry.PkgIdentifier);
  const purl = identifier?.PURL ?? entry.purl;
  return typeof purl === 'string' ? purl : null;
}

/** The distinct packages an analysis result lists (Trivy or SBOM); empty for anything else. */
export function extractInventoryPackages(result: unknown): InventoryPackage[] {
  const root = record(result);
  if (!root) return [];
  const found = new Map<string, InventoryPackage>();
  const add = (pkg: InventoryPackage | null) => {
    if (pkg) found.set(`${pkg.ecosystem}|${pkg.name}`, pkg);
  };

  if (Array.isArray(root.Results)) {
    for (const entry of root.Results) {
      const row = record(entry);
      if (!row) continue;
      const trivyEcosystem = TRIVY_ECOSYSTEMS[String(row.Type ?? '').toLowerCase()];
      const items = [
        ...(Array.isArray(row.Packages) ? row.Packages : []),
        ...(Array.isArray(row.Vulnerabilities) ? row.Vulnerabilities : []),
      ];
      for (const item of items) {
        const pkg = record(item);
        if (!pkg) continue;
        const fromPurl = parsePurl(purlOf(pkg));
        if (fromPurl) add(fromPurl);
        else if (trivyEcosystem) {
          const name = pkg.Name ?? pkg.PkgName;
          if (typeof name === 'string' && name)
            add({ ecosystem: trivyEcosystem, name: normalizeName(trivyEcosystem, name) });
        }
      }
    }
    return [...found.values()];
  }

  const components = Array.isArray(root.components)
    ? root.components
    : Array.isArray(root.artifacts)
      ? root.artifacts
      : [];
  for (const component of components) {
    const row = record(component);
    if (row) add(parsePurl(row.purl));
  }
  return [...found.values()];
}
