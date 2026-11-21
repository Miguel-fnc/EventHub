import assert from 'node:assert/strict';

const base = process.env.EVENTHUB_URL ?? 'http://127.0.0.1:8787';

async function request(path, expected, { token, body, method = body ? 'POST' : 'GET' } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}/api/${path}`, {
    method, headers, body: body && JSON.stringify(body)
  });
  const result = await response.text();
  assert.equal(response.status, expected, `${method} ${path}: ${result}`);
  return result ? JSON.parse(result) : undefined;
}

const password = 'eventhub-ci-demo-password';
const customer = { email: 'customer@example.test', password };
const administrator = { email: 'admin@example.test', password };
await request('health', 200);
await request('auth/register', 201, { body: customer });
const client = await request('auth/login', 200, { body: customer });
const admin = await request('auth/login', 200, { body: administrator });
assert.equal(client.role, 'customer');
assert.equal(admin.role, 'admin');
const event = {
  title: 'Evento de integración',
  description: 'Prueba del catálogo público',
  venue: 'Guadalajara',
  startsAt: new Date(Date.now() + 86400000).toISOString(),
  capacity: 2
};
await request('admin/events', 401, { body: event });
await request('admin/events', 403, { token: client.token, body: event });
const adminOptions = { token: admin.token };
const { id } = await request('admin/events', 201, { ...adminOptions, body: event });
const path = `admin/events/${id}`;
assert.equal((await request('events', 200)).find((item) => item.id === id)?.capacity, undefined);
assert.equal((await request('events', 200)).find((item) => item.id === id)?.availableSeats, 2);
const { confirmationCode } = await request('reservations', 201, {
  token: client.token, body: { eventId: id, seats: 2 }
});
await request(path, 409, { ...adminOptions, method: 'PATCH', body: { ...event, capacity: 1 } });
await request(path, 204, { ...adminOptions, method: 'PATCH', body: { ...event, capacity: 3 } });
assert.equal((await request('events', 200)).find((item) => item.id === id)?.availableSeats, 1);
const bookings = await request(`${path}/reservations`, 200, adminOptions);
assert.equal(bookings[0]?.email, customer.email);
assert.equal(bookings[0]?.cancelled, false);
const managed = async (eventId) => (await request('admin/events', 200, adminOptions)).find((item) => item.id === eventId);
// Con una reservación activa el evento no se puede eliminar.
assert.equal((await managed(id))?.activeReservations, 1);
await request(path, 409, { ...adminOptions, method: 'DELETE' });
await request(`reservations/${confirmationCode}/cancel`, 200, { token: client.token, body: {} });
assert.equal((await request('events', 200)).find((item) => item.id === id)?.availableSeats, 3);
assert.equal((await request(`${path}/reservations`, 200, adminOptions))[0]?.cancelled, true);
// Con solo reservaciones canceladas sí se elimina, junto con ese historial.
assert.deepEqual(
  [(await managed(id))?.activeReservations, (await managed(id))?.cancelledReservations], [0, 1]);
await request(path, 204, { ...adminOptions, method: 'DELETE' });
assert.equal(await managed(id), undefined);
assert.equal((await request('events', 200)).find((item) => item.id === id), undefined);
await request(path, 404, { ...adminOptions, method: 'DELETE' });
const empty = await request('admin/events', 201, { ...adminOptions, body: event });
assert.deepEqual([(await managed(empty.id))?.activeReservations, (await managed(empty.id))?.cancelledReservations], [0, 0]);
await request(`admin/events/${empty.id}`, 204, { ...adminOptions, method: 'DELETE' });
console.log('Flujo de cliente y administración verificado.');

