/**
 * Catalog of technologies an organization can follow in the CVE feed. Each one says how it is
 * looked up in every source: OSV by `{ ecosystem, package }` (ecosystem names are the exact OSV
 * ones) and NVD by CPE prefix. Type-only imports: the alert builder UI shares this file.
 */

export const OSV_ECOSYSTEMS = [
  'npm',
  'PyPI',
  'Go',
  'Maven',
  'crates.io',
  'RubyGems',
  'NuGet',
  'Packagist',
] as const;

export type OsvEcosystem = (typeof OSV_ECOSYSTEMS)[number];

export type TechnologyCategory =
  | 'runtime'
  | 'framework'
  | 'library'
  | 'database'
  | 'server'
  | 'infrastructure'
  | 'security'
  | 'os';

export type OsvPackageRef = { ecosystem: OsvEcosystem; package: string };

export type CveTechnology = {
  id: string;
  name: string;
  /** lucide icon name */
  icon: string;
  category: TechnologyCategory;
  osv: OsvPackageRef[];
  /** CPE 2.3 prefixes (`cpe:2.3:a:vendor:product`), used by NVD (phase 4) */
  cpe: string[];
};

export const CVE_TECHNOLOGIES: readonly CveTechnology[] = [
  // npm
  {
    id: 'nodejs',
    name: 'Node.js',
    icon: 'hexagon',
    category: 'runtime',
    osv: [],
    cpe: ['cpe:2.3:a:nodejs:node.js'],
  },
  {
    id: 'express',
    name: 'Express',
    icon: 'server',
    category: 'framework',
    osv: [{ ecosystem: 'npm', package: 'express' }],
    cpe: [],
  },
  {
    id: 'next',
    name: 'Next.js',
    icon: 'triangle',
    category: 'framework',
    osv: [{ ecosystem: 'npm', package: 'next' }],
    cpe: [],
  },
  {
    id: 'react',
    name: 'React',
    icon: 'atom',
    category: 'library',
    osv: [
      { ecosystem: 'npm', package: 'react' },
      { ecosystem: 'npm', package: 'react-dom' },
    ],
    cpe: [],
  },
  {
    id: 'svelte',
    name: 'Svelte',
    icon: 'flame',
    category: 'framework',
    osv: [{ ecosystem: 'npm', package: 'svelte' }],
    cpe: [],
  },
  {
    id: 'sveltekit',
    name: 'SvelteKit',
    icon: 'flame',
    category: 'framework',
    osv: [{ ecosystem: 'npm', package: '@sveltejs/kit' }],
    cpe: [],
  },
  {
    id: 'vite',
    name: 'Vite',
    icon: 'zap',
    category: 'library',
    osv: [{ ecosystem: 'npm', package: 'vite' }],
    cpe: [],
  },
  {
    id: 'lodash',
    name: 'Lodash',
    icon: 'package',
    category: 'library',
    osv: [
      { ecosystem: 'npm', package: 'lodash' },
      { ecosystem: 'npm', package: 'lodash-es' },
    ],
    cpe: [],
  },
  {
    id: 'axios',
    name: 'Axios',
    icon: 'package',
    category: 'library',
    osv: [{ ecosystem: 'npm', package: 'axios' }],
    cpe: [],
  },
  {
    id: 'nestjs',
    name: 'NestJS',
    icon: 'server',
    category: 'framework',
    osv: [{ ecosystem: 'npm', package: '@nestjs/core' }],
    cpe: [],
  },
  // PyPI
  {
    id: 'django',
    name: 'Django',
    icon: 'server',
    category: 'framework',
    osv: [{ ecosystem: 'PyPI', package: 'django' }],
    cpe: [],
  },
  {
    id: 'flask',
    name: 'Flask',
    icon: 'server',
    category: 'framework',
    osv: [{ ecosystem: 'PyPI', package: 'flask' }],
    cpe: [],
  },
  {
    id: 'fastapi',
    name: 'FastAPI',
    icon: 'zap',
    category: 'framework',
    osv: [{ ecosystem: 'PyPI', package: 'fastapi' }],
    cpe: [],
  },
  {
    id: 'requests',
    name: 'Requests (Python)',
    icon: 'package',
    category: 'library',
    osv: [{ ecosystem: 'PyPI', package: 'requests' }],
    cpe: [],
  },
  {
    id: 'pillow',
    name: 'Pillow',
    icon: 'package',
    category: 'library',
    osv: [{ ecosystem: 'PyPI', package: 'pillow' }],
    cpe: [],
  },
  // Maven
  {
    id: 'spring-boot',
    name: 'Spring Boot',
    icon: 'leaf',
    category: 'framework',
    osv: [{ ecosystem: 'Maven', package: 'org.springframework.boot:spring-boot' }],
    cpe: [],
  },
  {
    id: 'spring-framework',
    name: 'Spring Framework',
    icon: 'leaf',
    category: 'framework',
    osv: [{ ecosystem: 'Maven', package: 'org.springframework:spring-core' }],
    cpe: [],
  },
  {
    id: 'log4j',
    name: 'Apache Log4j',
    icon: 'scroll-text',
    category: 'library',
    osv: [{ ecosystem: 'Maven', package: 'org.apache.logging.log4j:log4j-core' }],
    cpe: [],
  },
  {
    id: 'jackson',
    name: 'Jackson',
    icon: 'braces',
    category: 'library',
    osv: [{ ecosystem: 'Maven', package: 'com.fasterxml.jackson.core:jackson-databind' }],
    cpe: [],
  },
  // Go
  {
    id: 'gin',
    name: 'Gin',
    icon: 'server',
    category: 'framework',
    osv: [{ ecosystem: 'Go', package: 'github.com/gin-gonic/gin' }],
    cpe: [],
  },
  {
    id: 'golang-x-net',
    name: 'golang.org/x/net',
    icon: 'network',
    category: 'library',
    osv: [{ ecosystem: 'Go', package: 'golang.org/x/net' }],
    cpe: [],
  },
  {
    id: 'golang-x-crypto',
    name: 'golang.org/x/crypto',
    icon: 'lock',
    category: 'library',
    osv: [{ ecosystem: 'Go', package: 'golang.org/x/crypto' }],
    cpe: [],
  },
  // Rust, Ruby, .NET, PHP
  {
    id: 'tokio',
    name: 'Tokio',
    icon: 'cog',
    category: 'library',
    osv: [{ ecosystem: 'crates.io', package: 'tokio' }],
    cpe: [],
  },
  {
    id: 'rails',
    name: 'Ruby on Rails',
    icon: 'train-front',
    category: 'framework',
    osv: [
      { ecosystem: 'RubyGems', package: 'rails' },
      { ecosystem: 'RubyGems', package: 'actionpack' },
    ],
    cpe: [],
  },
  {
    id: 'aspnet-core',
    name: 'ASP.NET Core',
    icon: 'server',
    category: 'framework',
    osv: [{ ecosystem: 'NuGet', package: 'Microsoft.AspNetCore.App.Runtime.linux-x64' }],
    cpe: [],
  },
  {
    id: 'laravel',
    name: 'Laravel',
    icon: 'server',
    category: 'framework',
    osv: [{ ecosystem: 'Packagist', package: 'laravel/framework' }],
    cpe: [],
  },
  // Software without a package: CPE
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    icon: 'database',
    category: 'database',
    osv: [],
    cpe: ['cpe:2.3:a:postgresql:postgresql'],
  },
  {
    id: 'mysql',
    name: 'MySQL',
    icon: 'database',
    category: 'database',
    osv: [],
    cpe: ['cpe:2.3:a:oracle:mysql'],
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    icon: 'database',
    category: 'database',
    osv: [],
    cpe: ['cpe:2.3:a:mongodb:mongodb'],
  },
  {
    id: 'redis',
    name: 'Redis',
    icon: 'database-zap',
    category: 'database',
    osv: [],
    cpe: ['cpe:2.3:a:redis:redis'],
  },
  {
    id: 'nginx',
    name: 'nginx',
    icon: 'server-cog',
    category: 'server',
    osv: [],
    cpe: ['cpe:2.3:a:f5:nginx', 'cpe:2.3:a:nginx:nginx'],
  },
  {
    id: 'apache-httpd',
    name: 'Apache HTTP Server',
    icon: 'server-cog',
    category: 'server',
    osv: [],
    cpe: ['cpe:2.3:a:apache:http_server'],
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    icon: 'boxes',
    category: 'infrastructure',
    osv: [{ ecosystem: 'Go', package: 'k8s.io/kubernetes' }],
    cpe: ['cpe:2.3:a:kubernetes:kubernetes'],
  },
  {
    id: 'docker',
    name: 'Docker Engine',
    icon: 'container',
    category: 'infrastructure',
    osv: [{ ecosystem: 'Go', package: 'github.com/docker/docker' }],
    cpe: ['cpe:2.3:a:docker:docker'],
  },
  {
    id: 'terraform',
    name: 'Terraform',
    icon: 'layers',
    category: 'infrastructure',
    osv: [{ ecosystem: 'Go', package: 'github.com/hashicorp/terraform' }],
    cpe: ['cpe:2.3:a:hashicorp:terraform'],
  },
  {
    id: 'openssl',
    name: 'OpenSSL',
    icon: 'lock',
    category: 'security',
    osv: [],
    cpe: ['cpe:2.3:a:openssl:openssl'],
  },
  {
    id: 'openssh',
    name: 'OpenSSH',
    icon: 'terminal',
    category: 'security',
    osv: [],
    cpe: ['cpe:2.3:a:openbsd:openssh'],
  },
  {
    id: 'linux-kernel',
    name: 'Linux kernel',
    icon: 'cpu',
    category: 'os',
    osv: [],
    cpe: ['cpe:2.3:o:linux:linux_kernel'],
  },
];

const BY_ID = new Map(CVE_TECHNOLOGIES.map((technology) => [technology.id, technology]));

export function getTechnology(id: string): CveTechnology | undefined {
  return BY_ID.get(id);
}

export function isKnownTechnology(id: string): boolean {
  return BY_ID.has(id);
}
