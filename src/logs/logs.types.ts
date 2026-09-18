export type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

export type RecordLogParams = {
  level: LogLevel;
  context: string | null;
  message: string;
  trace?: string | null;
};
