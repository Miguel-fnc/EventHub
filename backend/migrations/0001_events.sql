-- Las fechas se guardan como texto ISO 8601 en UTC (toISOString), comparables como cadenas.
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK (trim(title) <> ''),
    description TEXT NOT NULL DEFAULT '',
    venue TEXT NOT NULL CHECK (trim(venue) <> ''),
    starts_at TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    available_seats INTEGER NOT NULL CHECK (available_seats BETWEEN 0 AND capacity)
);

CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events (starts_at, id);
