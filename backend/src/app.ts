import { Hono } from 'hono';
import type { Context } from 'hono';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export interface User {
  id: number;
  email: string;
  role: 'customer' | 'admin';
}

export type AppEnv = { Bindings: Env; Variables: { user: User } };
export type App = Hono<AppEnv>;

export class BadRequest extends Error {}

const maxBody = 8 * 1024;

export async function readJson(c: Context<AppEnv>): Promise<unknown> {
  const text = await c.req.text();
  if (new TextEncoder().encode(text).length > maxBody) throw new BadRequest();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequest();
  }
}

export const now = () => new Date().toISOString();

export function d1Error(error: unknown, pattern: string) {
  return error instanceof Error && error.message.includes(pattern);
}
