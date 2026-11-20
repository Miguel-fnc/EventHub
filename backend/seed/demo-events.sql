INSERT INTO events (title, description, venue, starts_at, capacity, available_seats)
SELECT demo.title, demo.description, demo.venue,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now', demo.delay), demo.capacity, demo.capacity
FROM (
    SELECT 'Noche de jazz' AS title, 'Trío en vivo y repertorio de clásicos.' AS description,
           'Foro Independencia' AS venue, '+7 days' AS delay, 40 AS capacity
    UNION ALL SELECT 'Taller de fotografía', 'Práctica de retrato y composición con luz natural.',
           'Casa Taller', '+12 days', 18
    UNION ALL SELECT 'Festival gastronómico', 'Cocina local y muestras de productores de Jalisco.',
           'Parque Metropolitano', '+21 days', 120
) AS demo
WHERE NOT EXISTS (SELECT 1 FROM events);
