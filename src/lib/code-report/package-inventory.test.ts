import { describe, expect, it } from 'vitest';
import { extractInventoryPackages, parsePurl } from './package-inventory';

describe('parsePurl', () => {
  it('maps purl types to OSV ecosystems and names', () => {
    expect(parsePurl('pkg:npm/express@4.18.2')).toEqual({ ecosystem: 'npm', name: 'express' });
    expect(parsePurl('pkg:npm/%40sveltejs/kit@2.0.0')).toEqual({
      ecosystem: 'npm',
      name: '@sveltejs/kit',
    });
    expect(parsePurl('pkg:pypi/Django_Rest.Framework@3.0')).toEqual({
      ecosystem: 'PyPI',
      name: 'django-rest-framework',
    });
    expect(parsePurl('pkg:maven/org.apache.logging.log4j/log4j-core@2.17.0?type=jar')).toEqual({
      ecosystem: 'Maven',
      name: 'org.apache.logging.log4j:log4j-core',
    });
    expect(parsePurl('pkg:golang/golang.org/x/net@v0.17.0')).toEqual({
      ecosystem: 'Go',
      name: 'golang.org/x/net',
    });
    expect(parsePurl('pkg:gem/rails@7.0.0')).toEqual({ ecosystem: 'RubyGems', name: 'rails' });
  });

  it('is null for OS packages and malformed values', () => {
    expect(parsePurl('pkg:deb/debian/openssl@3.0')).toBeNull();
    expect(parsePurl('pkg:apk/alpine/musl@1.2')).toBeNull();
    expect(parsePurl('nonsense')).toBeNull();
    expect(parsePurl(undefined)).toBeNull();
  });
});

describe('extractInventoryPackages', () => {
  it('reads a Trivy report: packages (with --list-all-pkgs) and vulnerable ones, by result type', () => {
    const packages = extractInventoryPackages({
      Results: [
        {
          Type: 'npm',
          Packages: [{ Name: 'express', Version: '4.18.2' }, { Name: 'express' }],
          Vulnerabilities: [{ PkgName: 'lodash' }],
        },
        { Type: 'pip', Packages: [{ Name: 'Flask' }] },
        { Type: 'alpine', Packages: [{ Name: 'musl' }] },
        {
          Type: 'jar',
          Vulnerabilities: [
            {
              PkgName: 'org.springframework.boot:spring-boot',
              PkgIdentifier: { PURL: 'pkg:maven/org.springframework.boot/spring-boot@3.1.0' },
            },
          ],
        },
      ],
    });
    expect(packages).toEqual([
      { ecosystem: 'npm', name: 'express' },
      { ecosystem: 'npm', name: 'lodash' },
      { ecosystem: 'PyPI', name: 'flask' },
      { ecosystem: 'Maven', name: 'org.springframework.boot:spring-boot' },
    ]);
  });

  it('reads a CycloneDX and a syft SBOM through the purl of each component', () => {
    expect(
      extractInventoryPackages({
        components: [
          { name: 'express', purl: 'pkg:npm/express@4.18.2' },
          { name: 'musl', purl: 'pkg:apk/alpine/musl@1' },
          { name: 'no purl' },
        ],
      }),
    ).toEqual([{ ecosystem: 'npm', name: 'express' }]);
    expect(
      extractInventoryPackages({ artifacts: [{ name: 'django', purl: 'pkg:pypi/django@4.2' }] }),
    ).toEqual([{ ecosystem: 'PyPI', name: 'django' }]);
  });

  it('is empty for anything else', () => {
    expect(extractInventoryPackages(null)).toEqual([]);
    expect(extractInventoryPackages([])).toEqual([]);
    expect(extractInventoryPackages({ Results: 'x' })).toEqual([]);
  });
});
