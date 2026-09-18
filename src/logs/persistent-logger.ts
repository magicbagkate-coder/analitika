import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';
import { LogsService } from './logs.service';

/**
 * Installed once via `app.useLogger(...)` in main.ts — every `new Logger(SomeClass.name).log(...)`
 * call anywhere in the app routes through this same instance (NestJS's global override mechanism),
 * so nothing elsewhere in the codebase needs to change to get persisted logs.
 *
 * Extends ConsoleLogger (not a from-scratch LoggerService) specifically so console output stays
 * byte-for-byte what it already is today — `docker compose logs` keeps working exactly as before,
 * this only adds a second destination on top.
 */
@Injectable({ scope: Scope.DEFAULT })
export class PersistentLogger extends ConsoleLogger {
  constructor(private readonly logsService: LogsService) {
    super();
  }

  override log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(message, ...optionalParams);
    this.persist('log', message, optionalParams);
  }

  override error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(message, ...optionalParams);
    this.persist('error', message, optionalParams);
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(message, ...optionalParams);
    this.persist('warn', message, optionalParams);
  }

  override debug(message: unknown, ...optionalParams: unknown[]): void {
    super.debug(message, ...optionalParams);
    this.persist('debug', message, optionalParams);
  }

  override verbose(message: unknown, ...optionalParams: unknown[]): void {
    super.verbose(message, ...optionalParams);
    this.persist('verbose', message, optionalParams);
  }

  /**
   * NestJS's Logger convention: the context string (class name) is the LAST optional param when
   * present, and `error()` additionally may carry a stack trace as the FIRST optional param before
   * the context. Never throws — a malformed call here must not take down whatever just logged.
   */
  private persist(level: 'log' | 'error' | 'warn' | 'debug' | 'verbose', message: unknown, optionalParams: unknown[]): void {
    try {
      const context = this.extractContext(optionalParams);
      const trace = level === 'error' ? this.extractTrace(optionalParams) : null;
      this.logsService.record({ level, context, message: this.stringify(message), trace });
    } catch {
      // Swallow — logging must never be the thing that breaks the app.
    }
  }

  private extractContext(optionalParams: unknown[]): string | null {
    const last = optionalParams[optionalParams.length - 1];
    return typeof last === 'string' ? last : null;
  }

  private extractTrace(optionalParams: unknown[]): string | null {
    const first = optionalParams[0];
    return typeof first === 'string' && optionalParams.length > 1 ? first : null;
  }

  private stringify(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message instanceof Error) return message.message;
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}
