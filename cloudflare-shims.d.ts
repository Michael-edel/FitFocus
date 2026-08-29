declare interface D1Result<T = Record<string, unknown>> { results?: T[]; success?: boolean; meta?: unknown; changes?: number; }
declare interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}
declare interface D1Database { prepare(query: string): D1PreparedStatement; batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>; }
declare type PagesFunction<Env = unknown> = (context: { request: Request; env: Env; params?: Record<string, string>; data?: unknown; waitUntil?: (p: Promise<unknown>) => void; next?: () => Promise<Response>; }) => Response | Promise<Response>;
declare module '@cloudflare/workers-types' { export type PagesFunction<Env = unknown> = globalThis.PagesFunction<Env>; }
