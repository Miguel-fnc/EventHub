import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

export type Session = { token: string; email: string; role: string };
type Reservation = {
  id: string;
  title: string;
  seats: number;
  cancellationCode: string | null;
  canCancel: boolean;
};

export async function api<T>(path: string, options: { session?: Session; body?: object; method?: string; signal?: AbortSignal } = {}) {
  const headers = new Headers();
  if (options.session) headers.set('Authorization', `Bearer ${options.session.token}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api/${path}`, {
    headers,
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message ?? 'No se pudo completar la solicitud.');
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la solicitud.';
}

export function Account({ session, setSession, onChange, version }: {
  session: Session | null;
  setSession: (session: Session | null) => void;
  onChange: () => void;
  version: number;
}) {
  if (session) {
    return <Reservations key={session.token} session={session} version={version}
      onChange={onChange} onLogout={() => setSession(null)} />;
  }
  return <SignIn onLogin={setSession} />;
}

function SignIn({ onLogin }: { onLogin: (session: Session) => void }) {
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = { email: data.get('email'), password: data.get('password') };
    setBusy(true);
    setError('');
    try {
      if (registering) {
        await api('auth/register', { body });
        setRegistering(false);
      }
      onLogin(await api<Session>('auth/login', { body }));
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account">
      <h2>{registering ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
      <form className="inline-form" onSubmit={submit}>
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <label>Contraseña<input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'}
          minLength={8} maxLength={128} required /></label>
        <button disabled={busy}>{registering ? 'Registrarme' : 'Entrar'}</button>
        <button className="secondary" type="button" disabled={busy} onClick={() => {
          setRegistering(!registering);
          setError('');
        }}>{registering ? 'Ya tengo cuenta' : 'Crear cuenta'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function Reservations({ session, version, onChange, onLogout }: {
  session: Session;
  version: number;
  onChange: () => void;
  onLogout: () => void;
}) {
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<Reservation[]>('reservations', { session, signal: controller.signal }).then((items) => {
      if (controller.signal.aborted) return;
      setReservations(items);
      setLoadError('');
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(errorText(error));
    });
    return () => controller.abort();
  }, [session, version]);

  async function change(path: string) {
    setActionError('');
    setBusy(true);
    try {
      await api(path, { session, body: {} });
      if (path === 'auth/logout') onLogout();
      else onChange();
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account">
      <div className="account-header">
        <h2>Mis reservaciones</h2>
        <button className="secondary" disabled={busy} onClick={() => void change('auth/logout')}>Cerrar sesión</button>
      </div>
      <p>{session.email}</p>
      {loadError && <p role="alert">{loadError} <button onClick={onChange}>Volver a intentar</button></p>}
      {actionError && <p role="alert">{actionError}</p>}
      {!reservations && !loadError && <p role="status">Cargando reservaciones…</p>}
      {reservations?.length === 0 && <p>Aún no tienes reservaciones.</p>}
      {!!reservations?.length && <ul className="reservations">
        {reservations.map((reservation) => (
          <li key={reservation.id}>
            <strong>{reservation.title}</strong> · {reservation.seats} {reservation.seats === 1 ? 'lugar' : 'lugares'}
            <div className="reservation-code">Confirmación <code>{reservation.id}</code></div>
            {reservation.cancellationCode && (
              <div className="reservation-code">Cancelación <code>{reservation.cancellationCode}</code></div>
            )}
            {reservation.canCancel && <button className="secondary" disabled={busy}
              onClick={() => void change(`reservations/${reservation.id}/cancel`)}>Cancelar reservación</button>}
          </li>
        ))}
      </ul>}
    </section>
  );
}

export function ReserveForm({ session, eventId, available, onChange }: {
  session: Session;
  eventId: number;
  available: number;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const seats = Number(new FormData(event.currentTarget).get('seats'));
    setBusy(true);
    setError('');
    try {
      await api('reservations', { session, body: { eventId, seats } });
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      onChange();
      setBusy(false);
    }
  }

  return (
    <>
      <form className="inline-form" onSubmit={submit}>
        <label>Lugares<input name="seats" type="number" min={1} max={available} defaultValue={1} required /></label>
        <button disabled={busy}>Reservar</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

