INSERT INTO events (title, description, venue, starts_at, capacity, available_seats)
SELECT demo.title, demo.description, demo.venue, NOW() + demo.delay, demo.capacity, demo.capacity
FROM (VALUES
    ('Noche de jazz', 'Trío en vivo y repertorio de clásicos.', 'Foro Independencia', INTERVAL '7 days', 40),
    ('Taller de fotografía', 'Práctica de retrato y composición con luz natural.', 'Casa Taller', INTERVAL '12 days', 18),
    ('Festival gastronómico', 'Cocina local y muestras de productores de Jalisco.', 'Parque Metropolitano', INTERVAL '21 days', 120)
) AS demo(title, description, venue, delay, capacity)
WHERE NOT EXISTS (SELECT 1 FROM events);
