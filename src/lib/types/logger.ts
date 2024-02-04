export interface LogMethod {
  (message: any): LoggerInterface;
}

export interface LoggerInterface {
  error: LogMethod;
  warn: LogMethod;
  info: LogMethod;
  debug: LogMethod;
}