export const maxInt = 2147483647;
export const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type EventInput = [title: string, venue: string, description: string, startsAt: string, capacity: number];

export function eventInput(body: unknown): EventInput | null {
  const { title, venue, description, startsAt, capacity } = (body ?? {}) as Record<string, unknown>;
  if (typeof title !== 'string' || !title.trim() || title.length > 120 ||
      typeof venue !== 'string' || !venue.trim() || venue.length > 160 ||
      typeof description !== 'string' || description.length > 2000 ||
      typeof startsAt !== 'string' || !Number.isFinite(Date.parse(startsAt)) ||
      typeof capacity !== 'number' || !Number.isInteger(capacity) ||
      capacity < 1 || capacity > maxInt) return null;
  return [title.trim(), venue.trim(), description.trim(), new Date(startsAt).toISOString(), capacity];
}

export function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maxInt;
}

export function credentials(body: unknown) {
  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254 ||
      typeof password !== 'string' || password.length < 8 || password.length > 128) return null;
  return { email: normalized, password };
}

export function eventId(value: string) {
  return /^[1-9]\d*$/.test(value) && Number(value) <= maxInt ? Number(value) : null;
}
