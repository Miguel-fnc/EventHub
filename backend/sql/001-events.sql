CREATE TABLE IF NOT EXISTS events (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title TEXT NOT NULL CHECK (btrim(title) <> ''),
    description TEXT NOT NULL DEFAULT '',
    venue TEXT NOT NULL CHECK (btrim(venue) <> ''),
    starts_at TIMESTAMPTZ NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    available_seats INTEGER NOT NULL CHECK (available_seats BETWEEN 0 AND capacity)
);

CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events (starts_at, id);
