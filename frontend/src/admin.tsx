import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, errorText } from './customer';
import type { Session } from './customer';

type ManagedEvent = {
  id: number; title: string; venue: string; description: string;
  startsAt: string; capacity: number; availableSeats: number;
  activeReservations: number; cancelledReservations: number;
};

const plural = (count: number, singular: string, pluralForm: string) =>
  `${count} ${count === 1 ? singular : pluralForm}`;
type Booking = { id: string; email: string; seats: number; cancelled: boolean };

function localDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function Admin({ session, version, onChange }: {
  session: Session; version: number; onChange: () => void;
}) {
  const [events, setEvents] = useState<ManagedEvent[] | null>(null);
  const [editing, setEditing] = useState<ManagedEvent | null>(null);
  const [selected, setSelected] = useState<ManagedEvent | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [bookingError, setBookingError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Error al eliminar, mostrado junto al evento correspondiente.
  const [deleteError, setDeleteError] = useState<{ id: number; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<ManagedEvent[]>('admin/events', { session, signal: controller.signal }).then((items) => {
      if (controller.signal.aborted) return;
      setEvents(items);
      setLoadError('');
    }).catch((failure) => {
      if (!controller.signal.aborted) setLoadError(errorText(failure));
    });
    return () => controller.abort();
  }, [session, version]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    api<Booking[]>(`admin/events/${selected.id}/reservations`, { session, signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) { setBookings(items); setBookingError(''); }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setBookingError(errorText(failure));
      });
    return () => controller.abort();
  }, [session, selected, version]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const date = String(data.get('startsAt'));
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await api(editing ? `admin/events/${editing.id}` : 'admin/events', {
        session,
        method: editing ? 'PATCH' : 'POST',
        body: {
          title: data.get('title'), venue: data.get('venue'), description: data.get('description'),
          startsAt: editing && date === localDate(editing.startsAt) ? editing.startsAt : new Date(date).toISOString(),
          capacity: Number(data.get('capacity'))
        }
      });
      setMessage(editing ? 'Cambios guardados.' : 'Evento publicado en el catálogo.');
      form.reset();
      setEditing(null);
      onChange();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  async function remove(event: ManagedEvent) {
    const history = event.cancelledReservations > 0
      ? `\n\nTambién se borrará el historial de ${plural(event.cancelledReservations, 'reservación cancelada', 'reservaciones canceladas')}.`
      : '';
    if (!window.confirm(`¿Eliminar «${event.title}»?${history}`)) return;
    setBusy(true);
    setMessage('');
    setError('');
    setDeleteError(null);
    try {
      await api(`admin/events/${event.id}`, { session, method: 'DELETE' });
      if (editing?.id === event.id) setEditing(null);
      if (selected?.id === event.id) setSelected(null);
      setMessage(`Evento «${event.title}» eliminado.`);
      onChange();
    } catch (failure) {
      setDeleteError({ id: event.id, message: errorText(failure) });
      // Por si alguien reservó mientras tanto: refresca el conteo de reservaciones.
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account admin" id="administracion">
      <h2>Administración de eventos</h2>
      <form className="admin-form" key={editing?.id ?? 'new'} onSubmit={submit}>
        <h3>{editing ? `Editar ${editing.title}` : 'Publicar un evento'}</h3>
        <label>Nombre<input name="title" defaultValue={editing?.title} maxLength={120} required /></label>
        <label>Sede<input name="venue" defaultValue={editing?.venue} maxLength={160} required /></label>
        <label>Fecha y hora local<input name="startsAt" type="datetime-local" defaultValue={editing && localDate(editing.startsAt) || ''} required /></label>
        <label>Cupo total<input name="capacity" type="number" min={1} max={2147483647} defaultValue={editing?.capacity} required /></label>
        <label className="wide">Descripción<textarea name="description" defaultValue={editing?.description} maxLength={2000} rows={3} /></label>
        <div className="actions wide">
          <button disabled={busy}>{editing ? 'Guardar cambios' : 'Publicar evento'}</button>
          {editing && <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(null)}>Cancelar edición</button>}
        </div>
      </form>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <h3>Eventos registrados</h3>
      {loadError && <p role="alert">{loadError} <button onClick={onChange}>Reintentar</button></p>}
      {!events && !loadError && <p role="status">Cargando eventos.</p>}
      {events?.length === 0 && <p>Aún no hay eventos.</p>}
      {!!events?.length && <ul className="reservations">
        {events.map((event) => <li key={event.id}>
          <strong>{event.title}</strong>
          <p>{new Date(event.startsAt).toLocaleString('es-MX')} · {event.capacity - event.availableSeats} de {event.capacity} lugares ocupados</p>
          <div className="actions">
            <button className="secondary" disabled={busy} onClick={() => {
              setEditing(event);
              document.getElementById('administracion')?.scrollIntoView();
            }}>Editar</button>
            <button className="secondary" type="button" onClick={() => {
              if (event.id === selected?.id) { setSelected(null); return; }
              setBookings(null);
              setBookingError('');
              setSelected(event);
            }}>{event.id === selected?.id ? 'Ocultar reservaciones' : 'Ver reservaciones'}</button>
            <button className="danger" disabled={busy || event.activeReservations > 0}
              aria-describedby={event.activeReservations > 0 ? `no-delete-${event.id}` : undefined}
              title={event.activeReservations > 0 ? 'Los eventos con reservaciones activas no se pueden eliminar' : undefined}
              onClick={() => void remove(event)}>Eliminar</button>
          </div>
          {event.activeReservations > 0 && (
            <p className="field-note" id={`no-delete-${event.id}`}>
              No se puede eliminar: tiene {plural(event.activeReservations, 'reservación activa', 'reservaciones activas')}.
            </p>
          )}
          {deleteError?.id === event.id && <p role="alert">{deleteError.message}</p>}
          {selected?.id === event.id && <section className="booking-details">
            <h4>Reservaciones de {event.title}</h4>
            {bookingError && <p role="alert">{bookingError} <button onClick={onChange}>Reintentar</button></p>}
            {!bookings && !bookingError && <p role="status">Cargando reservaciones.</p>}
            {bookings?.length === 0 && <p>Aún no hay reservaciones.</p>}
            {!!bookings?.length && <ul>{bookings.map((booking) => <li key={booking.id}>
              {booking.email} · {booking.seats} {booking.seats === 1 ? 'lugar' : 'lugares'} · {booking.cancelled ? 'Cancelada' : 'Activa'}
            </li>)}</ul>}
          </section>}
        </li>)}
      </ul>}
    </section>
  );
}
