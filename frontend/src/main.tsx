import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Admin } from './admin';
import { Account, ReserveForm } from './customer';
import type { Session } from './customer';

type Event = {
  id: number;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  availableSeats: number;
};

type Catalog =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; events: Event[] };

const dateFormat = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City'
});

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  function refreshEvents() {
    setAttempt((value) => value + 1);
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadEvents() {
      try {
        const response = await fetch('/api/events', { signal: controller.signal });
        if (!response.ok) throw new Error('No se pudieron cargar los eventos.');
        const events: Event[] = await response.json();
        if (!controller.signal.aborted) setCatalog({ status: 'ready', events });
      } catch {
        if (!controller.signal.aborted) setCatalog({ status: 'error' });
      }
    }

    void loadEvents();
    return () => controller.abort();
  }, [attempt]);

  return (
    <>
      <header className="site-header"><nav className="container nav">
        <a className="brand" href="#"><span aria-hidden="true">✦</span> EventHub</a>
        <div className="actions">
          <a href="#eventos">Explorar eventos</a>
          <a href="#cuenta">{session ? 'Mis reservaciones' : 'Mi cuenta'}</a>
          {session?.role === 'admin' && <a href="#administracion">Administrar</a>}
        </div>
      </nav></header>
      <main className="container">
        <section className="hero">
          <div>
            <h1>Tu próximo plan<br />empieza aquí.</h1>
            <p>Descubre qué está pasando y reserva tu lugar. ¡Ahora en Cloudflare!</p>
            <a className="hero-link" href="#eventos">Ver eventos <span aria-hidden="true">↓</span></a>
          </div>
          <div className="hero-art" aria-hidden="true"><i></i><i></i><i></i><span>✦</span></div>
        </section>
        <h2 className="catalog-title" id="eventos">Próximos eventos</h2>
        {catalog.status === 'loading' && <p role="status">Cargando eventos…</p>}
        {catalog.status === 'error' && (
          <div className="notice">
            <p role="alert">No se pudieron cargar los eventos.</p>
            <button onClick={() => {
              setCatalog({ status: 'loading' });
              refreshEvents();
            }}>Volver a intentar</button>
          </div>
        )}
        {catalog.status === 'ready' && (
          catalog.events.length === 0 ? <p>No hay eventos programados.</p> : (
            <ul className="event-grid">
              {catalog.events.map((event) => (
                <li key={event.id}>
                  <article><div className="event-art" aria-hidden="true"><span>✦</span></div><div className="event-body">
                    <time dateTime={event.startsAt}>{dateFormat.format(new Date(event.startsAt))}</time>
                    <h3>{event.title}</h3>
                    <p className="venue">{event.venue}</p>
                    <p>{event.description}</p>
                    <p className="capacity">
                      {event.availableSeats === 0 ? 'Agotado' :
                        event.availableSeats === 1 ? '1 lugar disponible' :
                          `${event.availableSeats} lugares disponibles`}
                    </p>
                    {!session && event.availableSeats > 0 && (
                      <a href="#cuenta">Inicia sesión para reservar</a>
                    )}
                    {session && event.availableSeats > 0 && (
                      <ReserveForm key={session.token} session={session} eventId={event.id}
                        available={event.availableSeats} onChange={refreshEvents} />
                    )}
                  </div></article>
                </li>
              ))}
            </ul>
          )
        )}
      <div id="cuenta"><Account session={session} setSession={setSession} onChange={refreshEvents} version={attempt} /></div>
        {session?.role === 'admin' && <Admin key={session.token} session={session} version={attempt} onChange={refreshEvents} />}
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);


