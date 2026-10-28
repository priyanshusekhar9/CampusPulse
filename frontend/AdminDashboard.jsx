
import { useEffect, useState } from "react";

const EMPTY = {
  title: "", description: "", category: "Technical",
  venue: "", event_date: "", capacity: "", image: null
};

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
}

export default function AdminDashboard({ api, onBack }) {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState(null);
  const [attendeeEvent, setAttendeeEvent] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadEvents() {
    try {
      const response = await fetch(`${api}/api/events`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load events.");
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${api}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Login failed.");

      const role = String(data.admin?.role || data.role || "").toLowerCase();
      if (!data.token || role !== "admin") throw new Error("Admin access required.");

      setToken(data.token);
      setPassword("");
      setMessage("Admin login successful.");
      await loadEvents();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function updateField(e) {
    const { name, value, files } = e.target;
    setForm((old) => ({
      ...old,
      [name]: name === "image" ? files?.[0] || null : value
    }));
  }

  function resetForm() {
    setForm({ ...EMPTY });
    setEditingId(null);
    const fileInput = document.getElementById("event-image");
    if (fileInput) fileInput.value = "";
  }

  function startEditing(event) {
    setEditingId(event.id);
    setForm({
      title: event.title || "",
      description: event.description || "",
      category: event.category || "Technical",
      venue: event.venue || "",
      event_date: toLocalDateTime(event.event_date),
      capacity: event.capacity ?? "",
      image: null
    });
    setError("");
    setMessage("");
    document.getElementById("event-form-panel")?.scrollIntoView({
      behavior: "smooth", block: "start"
    });
  }

  async function saveEvent(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const body = new FormData();
      for (const field of ["title", "description", "category", "venue", "event_date"]) {
        body.append(field, String(form[field] || "").trim());
      }
      body.append("capacity", form.capacity);
      if (form.image) body.append("image", form.image);

      const editing = editingId !== null;
      const response = await fetch(
        editing ? `${api}/api/events/${editingId}` : `${api}/api/events`,
        {
          method: editing ? "PUT" : "POST",
          headers: { Authorization: `Bearer ${token}` },
          body
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not save event.");

      setMessage(data.message || "Event saved.");
      resetForm();
      await loadEvents();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent(event) {
    if (!window.confirm(
      `Delete "${event.title}" and all its registrations? This cannot be undone.`
    )) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${api}/api/events/${event.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Delete failed.");

      if (editingId === event.id) resetForm();
      if (attendeeEvent?.id === event.id) setAttendeeEvent(null);
      setMessage(data.message);
      await loadEvents();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadPoster(eventId, file) {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const body = new FormData();
      body.append("image", file);

      const response = await fetch(`${api}/api/events/${eventId}/image`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Poster upload failed.");

      setMessage(data.message);
      await loadEvents();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function viewAttendees(event) {
    setAttendeeEvent(event);
    setAttendees([]);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `${api}/api/events/${event.id}/registrations`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load attendees.");
      setAttendees(data.attendees || []);
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    setToken("");
    setEmail("");
    setPassword("");
    setMessage("");
    setError("");
    resetForm();
    setAttendeeEvent(null);
  }

  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <button className="back-button" onClick={onBack}>← Back to website</button>
        <div className="brand">
          <span className="brand-icon">C</span>
          <span>Campus<span className="brand-accent">Pulse</span></span>
        </div>
        {token
          ? <button className="admin-button" onClick={logout}>Log out</button>
          : <span className="admin-status">ADMIN PORTAL</span>}
      </header>

      {!token ? (
        <main className="login-layout">
          <section className="login-intro">
            <span className="eyebrow">CAMPUS PULSE MANAGEMENT</span>
            <h1>Manage every campus event in one place.</h1>
            <p>Publish events, manage capacity, view attendees and update posters.</p>
          </section>
          <form className="login-card" onSubmit={handleLogin}>
            <span className="eyebrow">WELCOME BACK</span>
            <h2>Admin Login</h2>
            <p>Enter administrator credentials.</p>
            <label htmlFor="admin-email">Email address</label>
            <input id="admin-email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            <label htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" required />
            {error && <div className="admin-alert error">{error}</div>}
            <button className="primary-button full-button" disabled={busy}>
              {busy ? "Signing in..." : "Sign In →"}
            </button>
          </form>
        </main>
      ) : (
        <main className="dashboard-main">
          <div className="dashboard-heading">
            <div>
              <span className="eyebrow">ADMINISTRATION</span>
              <h1>Dashboard</h1>
              <p>Manage events, seat capacity and attendees.</p>
            </div>
            <span className="logged-in-label">● Admin signed in</span>
          </div>

          {error && <div className="admin-alert error">{error}</div>}
          {message && <div className="admin-alert success">{message}</div>}

          <section className="stats-grid">
            <article className="stat-card">
              <span>Total events</span><strong>{events.length}</strong>
              <small>Events in database</small>
            </article>
            <article className="stat-card">
              <span>With posters</span>
              <strong>{events.filter((e) => e.image_url).length}</strong>
              <small>Events with images</small>
            </article>
            <article className="stat-card">
              <span>Registrations</span>
              <strong>{events.reduce((sum, e) => sum + Number(e.registered_count || 0), 0)}</strong>
              <small>Total event bookings</small>
            </article>
          </section>

          <section className="admin-panel" id="event-form-panel">
            <div className="panel-heading">
              <div>
                <h2>{editingId !== null ? `Edit Event #${editingId}` : "Create an event"}</h2>
                <p>Leave capacity empty for unlimited registrations.</p>
              </div>
            </div>

            <form className="event-form" onSubmit={saveEvent}>
              <div className="form-field">
                <label htmlFor="event-title">Event title *</label>
                <input id="event-title" name="title" value={form.title}
                  onChange={updateField} maxLength={160} required />
              </div>
              <div className="form-field">
                <label htmlFor="event-category">Category *</label>
                <select id="event-category" name="category" value={form.category}
                  onChange={updateField} required>
                  {["Technical", "Cultural", "Workshop", "Sports", "Literary", "Academic", "Other"]
                    .map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="event-venue">Venue *</label>
                <input id="event-venue" name="venue" value={form.venue}
                  onChange={updateField} maxLength={160} required />
              </div>
              <div className="form-field">
                <label htmlFor="event-date">Date and time *</label>
                <input id="event-date" name="event_date" type="datetime-local"
                  value={form.event_date} onChange={updateField} required />
              </div>
              <div className="form-field">
                <label htmlFor="event-capacity">Seat capacity</label>
                <input id="event-capacity" name="capacity" type="number"
                  min="1" step="1" value={form.capacity} onChange={updateField}
                  placeholder="Empty = unlimited" />
              </div>
              <div className="form-field full-width">
                <label htmlFor="event-description">Description</label>
                <textarea id="event-description" name="description"
                  value={form.description} onChange={updateField} rows={4} />
              </div>
              <div className="form-field full-width">
                <label htmlFor="event-image">Poster (optional)</label>
                <input id="event-image" name="image" type="file"
                  accept="image/jpeg,image/png,image/webp" onChange={updateField} />
                <small>JPG, PNG or WebP. Maximum 5 MB.</small>
              </div>
              <div className="form-actions full-width">
                <button type="submit" className="primary-button" disabled={busy}>
                  {busy ? "Saving..." : editingId !== null ? "Save Changes" : "＋ Publish Event"}
                </button>
                {editingId !== null && (
                  <button type="button" className="refresh-button" onClick={resetForm}>
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="admin-panel">
            <div className="panel-heading">
              <div><h2>Manage existing events</h2><p>Edit, delete, and view registrations.</p></div>
              <button className="refresh-button" onClick={loadEvents}>↻ Refresh</button>
            </div>

            <div className="manage-list">
              {events.map((event) => {
                const count = Number(event.registered_count || 0);
                const capacity = event.capacity == null ? null : Number(event.capacity);

                return (
                  <article className="manage-event" key={event.id}>
                    {event.image_url
                      ? <img className="manage-thumbnail"
                          src={event.image_url.startsWith("http") ? event.image_url : `${api}${event.image_url}`}
                          alt={event.title} />
                      : <div className="manage-thumbnail thumbnail-empty">No poster</div>}

                    <div className="manage-event-info">
                      <strong>{event.title}</strong>
                      <span>#{event.id} · {event.category}</span>
                      <small>{event.venue}</small>
                      <small>
                        Seats: {count}{capacity === null ? " registered · Unlimited" : ` / ${capacity}`}
                      </small>
                    </div>

                    <div className="manage-actions">
                      <button className="refresh-button" onClick={() => startEditing(event)}>Edit</button>
                      <button className="refresh-button" onClick={() => viewAttendees(event)}>Attendees</button>
                      <label className="upload-button">
                        Change poster
                        <input type="file" accept="image/jpeg,image/png,image/webp"
                          disabled={busy} onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadPoster(event.id, file);
                            e.target.value = "";
                          }} />
                      </label>
                      <button className="delete-button" disabled={busy}
                        onClick={() => deleteEvent(event)}>Delete</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {attendeeEvent && (
            <section className="admin-panel">
              <div className="panel-heading">
                <div>
                  <h2>Attendees: {attendeeEvent.title}</h2>
                  <p>{attendees.length} registered student(s)</p>
                </div>
                <button className="refresh-button" onClick={() => setAttendeeEvent(null)}>
                  Close
                </button>
              </div>
              {attendees.length === 0 ? (
                <p className="status-message">No registrations yet.</p>
              ) : (
                <div className="attendee-table-wrap">
                  <table className="attendee-table">
                    <thead><tr><th>Name</th><th>Email</th><th>Registered at</th></tr></thead>
                    <tbody>
                      {attendees.map((student) => (
                        <tr key={student.id}>
                          <td>{student.name}</td>
                          <td>{student.email}</td>
                          <td>{student.registered_at
                            ? new Date(student.registered_at).toLocaleString("en-IN")
                            : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </main>
      )}
    </div>
  );
}
