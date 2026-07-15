export type GitDbLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type GitDbLoggerLike = {
  debug?: (message: string, ...meta: unknown[]) => void;
  info?: (message: string, ...meta: unknown[]) => void;
  warn?: (message: string, ...meta: unknown[]) => void;
  error?: (message: string, ...meta: unknown[]) => void;
  log?: (level: GitDbLogLevel | string, message: string, ...meta: unknown[]) => void;
};

export class GitDbLogger {
  constructor(private readonly target: GitDbLoggerLike = console) {}

  debug(message: string, ...meta: unknown[]): void {
    this.write('debug', message, meta);
  }

  info(message: string, ...meta: unknown[]): void {
    this.write('info', message, meta);
  }

  warn(message: string, ...meta: unknown[]): void {
    this.write('warn', message, meta);
  }

  error(message: string, ...meta: unknown[]): void {
    this.write('error', message, meta);
  }

  private write(level: GitDbLogLevel, message: string, meta: unknown[]): void {
    const target = this.target as GitDbLoggerLike & Record<string, unknown>;
    const method = target[level];

    if (typeof method === 'function') {
      method.call(target, message, ...meta);
      return;
    }

    if (typeof target.log === 'function') {
      target.log(level, message, ...meta);
      return;
    }

    const fallback = console[level] ?? console.log;
    fallback.call(console, message, ...meta);
  }
}
