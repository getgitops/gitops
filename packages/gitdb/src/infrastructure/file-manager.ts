import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class FileManager {
  constructor(private readonly basePath: string) {}

  async readEntityRows<T>(entityName: string): Promise<T[]> {
    await this.ensureEntityFile(entityName);

    const filePath = this.getEntityFilePath(entityName);
    const content = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error(`Entity file ${entityName}.json must contain a JSON array`);
    }

    return parsed as T[];
  }

  async writeEntityRows<T>(entityName: string, rows: T[]): Promise<void> {
    const filePath = this.getEntityFilePath(entityName);
    await writeFile(filePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  }

  private async ensureEntityFile(entityName: string): Promise<void> {
    const filePath = this.getEntityFilePath(entityName);

    if (existsSync(filePath)) {
      return;
    }

    await writeFile(filePath, '[]\n', 'utf8');
  }

  private getEntityFilePath(entityName: string): string {
    return path.join(this.basePath, `${entityName}.json`);
  }
}
