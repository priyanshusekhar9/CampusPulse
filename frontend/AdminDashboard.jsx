import { useEffect, useState } from "react";

const EMPTY = {
  title: "",
  description: "",
  category: "Technical",
  venue: "",
  event_date: "",
  registration_deadline: "",
  capacity: "",
  image: null
};

function toLocalDateTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) return "Not set";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export default function AdminDashboard({ api, onBack }) {
  const [token, setToken] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [events, setEvents] = useState([]);
  const [deletedEvents, setDeletedEvents] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);

  const [activeTab, setActiveTab] = useState("active");

  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState(null);

  const [attendeeEvent, setAttendeeEvent] = useState(null);
  const [attendees, setAttendees] = useState([]);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // -------------------- API REQUEST --------------------

  async function apiRequest(url, options = {}) {
    const headers = {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),

      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {}),

      ...options.headers
    };

    const response = await fetch(`${api}${url}`, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }

    return data;
  }

  // -------------------- LOAD DATA --------------------

  async function loadEvents() {
    const data = await apiRequest("/api/events");

    setEvents(Array.isArray(data) ? data : []);
  }

  async function loadDeletedEvents() {
    const data = await apiRequest(
      "/api/admin/events/deleted"
    );

    setDeletedEvents(Array.isArray(data) ? data : []);
  }

  async function loadPastEvents() {
    const data = await apiRequest(
      "/api/admin/events/past"
    );

    setPastEvents(Array.isArray(data) ? data : []);
  }

  async function loadActivityLogs() {
    const data = await apiRequest(
      "/api/admin/activity-logs"
    );

    setActivityLogs(Array.isArray(data) ? data : []);
  }

  async function refreshAll() {
    setError("");

    try {
      await Promise.all([
        loadEvents(),
        loadDeletedEvents(),
        loadPastEvents(),
        loadActivityLogs()
      ]);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (token) {
      refreshAll();
    }
  }, [token]);

  // -------------------- ADMIN LOGIN --------------------

  async function handleLogin(e) {
    e.preventDefault();

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `${api}/api/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: email.trim(),
            password
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed.");
      }

      const role = String(
        data.admin?.role || data.role || ""
      ).toLowerCase();

      if (!data.token || role !== "admin") {
        throw new Error("Admin access required.");
      }

      setToken(data.token);
      setPassword("");
      setMessage("Admin login successful.");

    } catch (err) {
      setError(err.message);

    } finally {
      setBusy(false);
    }
  }

  // -------------------- FORM HANDLING --------------------

  function updateField(e) {
    const { name, value, files } = e.target;

    setForm(old => ({
      ...old,
      [name]:
        name === "image"
          ? files?.[0] || null
          : value
    }));
  }

  function resetForm() {
    setForm({ ...EMPTY });
    setEditingId(null);

    const input = document.getElementById("event-image");

    if (input) {
      input.value = "";
    }
  }

  function startEditing(event) {
    setEditingId(event.id);

    setForm({
      title: event.title || "",
      description: event.description || "",
      category: event.category || "Technical",
      venue: event.venue || "",

      event_date: toLocalDateTime(
        event.event_date
      ),

      registration_deadline: toLocalDateTime(
        event.registration_deadline
      ),

      capacity: event.capacity ?? "",
      image: null
    });

    setError("");
    setMessage("");

    document
      .getElementById("event-form-panel")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  }

  // -------------------- CREATE / UPDATE EVENT --------------------

  async function saveEvent(e) {
    e.preventDefault();

    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (
        form.registration_deadline &&
        form.event_date &&
        new Date(form.registration_deadline) >
          new Date(form.event_date)
      ) {
        throw new Error(
          "Registration deadline cannot be after the event date."
        );
      }

      const body = new FormData();

      [
        "title",
        "description",
        "category",
        "venue",
        "event_date",
        "registration_deadline"
      ].forEach(field => {
        body.append(
          field,
          String(form[field] || "").trim()
        );
      });

      body.append("capacity", form.capacity);

      if (form.image) {
        body.append("image", form.image);
      }

      const editing = editingId !== null;

      const data = await apiRequest(
        editing
          ? `/api/events/${editingId}`
          : "/api/events",
        {
          method: editing ? "PUT" : "POST",
          body
        }
      );

      setMessage(
        data.message || "Event saved successfully."
      );

      resetForm();

      await refreshAll();

    } catch (err) {
      setError(err.message);

    } finally {
      setBusy(false);
    }
  }

  // -------------------- SOFT DELETE EVENT --------------------

  async function deleteEvent(event) {
    const confirmDelete = window.confirm(
      `Move "${event.title}" to Deleted Events?`
    );

    if (!confirmDelete) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const data = await apiRequest(
        `/api/events/${event.id}`,
        {
          method: "DELETE"
        }
      );

      if (editingId === event.id) {
        resetForm();
      }

      if (attendeeEvent?.id === event.id) {
        setAttendeeEvent(null);
      }

      setMessage(data.message);

      await refreshAll();

    } catch (err) {
      setError(err.message);

    } finally {
      setBusy(false);
    }
  }

  // -------------------- RESTORE EVENT --------------------

  async function restoreEvent(event) {
    const confirmRestore = window.confirm(
      `Restore "${event.title}"?`
    );

    if (!confirmRestore) return;

    setBusy(true);
    setError("");

    try {
      const data = await apiRequest(
        `/api/events/${event.id}/restore`,
        {
          method: "PATCH"
        }
      );

      setMessage(data.message);

      await refreshAll();

    } catch (err) {
      setError(err.message);

    } finally {
      setBusy(false);
    }
  }

  // -------------------- PERMANENT DELETE --------------------

  async function permanentDelete(event) {
    const confirmDelete = window.confirm(
      `Permanently delete "${event.title}" and all its registrations? This cannot be undone.`
    );

    if (!confirmDelete) return;

    setBusy(true);
    setError("");

    try {
      const data = await apiRequest(
        `/api/events/${event.id}/permanent`,
        {
          method: "DELETE"
        }
      );

      setMessage(data.message);

      await refreshAll();

    } catch (err) {
      setError(err.message);

    } finally {
      setBusy(false);
    }
  }

  // -------------------- CHANGE POSTER --------------------

  async function uploadPoster(eventId, file) {
    if (!file) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const body = new FormData();

      body.append("image", file);

      const data = await apiRequest(
        `/api/events/${eventId}/image`,
        {
          method: "PUT",
          body
        }
      );

      setMessage(data.message);

      await refreshAll();

    } catch (err) {
      setError(err.message);

    } finally {
      setBusy(false);
    }
  }

  // -------------------- VIEW ATTENDEES --------------------

  async function viewAttendees(event) {
    setAttendeeEvent(event);
    setAttendees([]);
    setError("");
    setMessage("");

    try {
      const data = await apiRequest(
        `/api/events/${event.id}/registrations`
      );

      setAttendees(data.attendees || []);

    } catch (err) {
      setError(err.message);
    }
  }

  // -------------------- REMOVE ATTENDEE --------------------

  async function removeAttendee(person) {
    const confirmRemove = window.confirm(
      `Remove ${person.name} from ${attendeeEvent.title}?`
    );

    if (!confirmRemove) return;

    setBusy(true);
    setError("");

    try {
      const data = await apiRequest(
        `/api/events/${attendeeEvent.id}/registrations/${person.id}`,
        {
          method: "DELETE"
        }
      );

      setMessage(data.message);

      await viewAttendees(attendeeEvent);
      await refreshAll();

    } catch (err) {
      setError(err.message);

    } finally {
      setBusy(false);
    }
  }

  // -------------------- LOGOUT --------------------

  function logout() {
    setToken("");
    setEmail("");
    setPassword("");

    setMessage("");
    setError("");

    setEvents([]);
    setDeletedEvents([]);
    setPastEvents([]);
    setActivityLogs([]);

    resetForm();

    setAttendeeEvent(null);
    setAttendees([]);

    setActiveTab("active");
  }

  // -------------------- EVENT CARD --------------------

  function renderEventCard(event, type = "active") {
    const count = Number(
      event.registered_count || 0
    );

    const capacity =
      event.capacity == null
        ? null
        : Number(event.capacity);

    return (
      <article
        className="manage-event"
        key={event.id}
      >
        {event.image_url ? (
          <img
            className="manage-thumbnail"
            src={
              event.image_url.startsWith("http")
                ? event.image_url
                : `${api}${event.image_url}`
            }
            alt={event.title}
          />
        ) : (
          <div className="manage-thumbnail thumbnail-empty">
            No poster
          </div>
        )}

        <div className="manage-event-info">
          <strong>{event.title}</strong>

          <span>
            #{event.id} · {event.category}
          </span>

          <small>{event.venue}</small>

          <small>
            Event: {formatDate(event.event_date)}
          </small>

          <small>
            Registered: {count}
            {capacity === null
              ? " · Unlimited"
              : ` / ${capacity}`}
          </small>

          {type === "deleted" && (
            <small>
              Deleted: {formatDate(event.deletedAt)}
            </small>
          )}
        </div>

        <div className="manage-actions">

          {type === "active" && (
            <>
              <button
                className="refresh-button"
                onClick={() => startEditing(event)}
                disabled={busy}
              >
                Edit
              </button>

              <button
                className="refresh-button"
                onClick={() => viewAttendees(event)}
                disabled={busy}
              >
                Attendees
              </button>

              <label className="upload-button">
                Change poster

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={e => {
                    const file = e.target.files?.[0];

                    if (file) {
                      uploadPoster(event.id, file);
                    }

                    e.target.value = "";
                  }}
                />
              </label>

              <button
                className="delete-button"
                onClick={() => deleteEvent(event)}
                disabled={busy}
              >
                Delete
              </button>
            </>
          )}

          {type === "past" && (
            <button
              className="refresh-button"
              onClick={() => viewAttendees(event)}
              disabled={busy}
            >
              View Attendees
            </button>
          )}

          {type === "deleted" && (
            <>
              <button
                className="refresh-button"
                onClick={() => restoreEvent(event)}
                disabled={busy}
              >
                Restore
              </button>

              <button
                className="delete-button"
                onClick={() => permanentDelete(event)}
                disabled={busy}
              >
                Permanent Delete
              </button>
            </>
          )}

        </div>
      </article>
    );
  }

  // -------------------- MAIN UI --------------------

  return (
    <div className="admin-page">

      <header className="admin-topbar">

        <button
          className="back-button"
          onClick={onBack}
        >
          ← Back to website
        </button>

        <div className="brand">
          <span className="brand-icon">C</span>

          <span>
            Campus
            <span className="brand-accent">
              Pulse
            </span>
          </span>
        </div>

        {token ? (
          <button
            className="admin-button"
            onClick={logout}
          >
            Log out
          </button>
        ) : (
          <span className="admin-status">
            ADMIN PORTAL
          </span>
        )}

      </header>

      {/* -------------------- LOGIN PAGE -------------------- */}

      {!token ? (

        <main className="login-layout">

          <section className="login-intro">
            <span className="eyebrow">
              CAMPUS PULSE MANAGEMENT
            </span>

            <h1>
              Manage every campus event in one place.
            </h1>

            <p>
              Publish events, manage capacity,
              view attendees and update posters.
            </p>
          </section>

          <form
            className="login-card"
            onSubmit={handleLogin}
          >
            <span className="eyebrow">
              WELCOME BACK
            </span>

            <h2>Admin Login</h2>

            <p>
              Enter administrator credentials.
            </p>

            <label htmlFor="admin-email">
              Email address
            </label>

            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="username"
              required
            />

            <label htmlFor="admin-password">
              Password
            </label>

            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            {error && (
              <div className="admin-alert error">
                {error}
              </div>
            )}

            <button
              className="primary-button full-button"
              disabled={busy}
            >
              {busy ? "Signing in..." : "Sign In →"}
            </button>
          </form>

        </main>

      ) : (

        // -------------------- DASHBOARD --------------------

        <main className="dashboard-main">

          <div className="dashboard-heading">

            <div>
              <span className="eyebrow">
                ADMINISTRATION
              </span>

              <h1>Dashboard</h1>

              <p>
                Manage events, deadlines,
                registrations and attendees.
              </p>
            </div>

            <span className="logged-in-label">
              ● Admin signed in
            </span>

          </div>

          {error && (
            <div className="admin-alert error">
              {error}
            </div>
          )}

          {message && (
            <div className="admin-alert success">
              {message}
            </div>
          )}

          {/* -------------------- STATISTICS -------------------- */}

          <section className="stats-grid">

            <article className="stat-card">
              <span>Active Events</span>
              <strong>{events.length}</strong>
              <small>Upcoming events</small>
            </article>

            <article className="stat-card">
              <span>Past Events</span>
              <strong>{pastEvents.length}</strong>
              <small>Completed events</small>
            </article>

            <article className="stat-card">
              <span>Deleted Events</span>
              <strong>{deletedEvents.length}</strong>
              <small>Events in trash</small>
            </article>

            <article className="stat-card">
              <span>Registrations</span>

              <strong>
                {events.reduce(
                  (sum, event) =>
                    sum + Number(event.registered_count || 0),
                  0
                )}
              </strong>

              <small>
                Active event registrations
              </small>
            </article>

          </section>

          {/* -------------------- NAVIGATION TABS -------------------- */}

          <section className="admin-panel">

            <div className="panel-heading">

              <div>
                <h2>Event Management</h2>
                <p>Choose a section to manage.</p>
              </div>

              <button
                className="refresh-button"
                onClick={refreshAll}
                disabled={busy}
              >
                ↻ Refresh
              </button>

            </div>

            <div className="admin-tabs">

              <button
                className={
                  activeTab === "active" ? "active" : ""
                }
                onClick={() => setActiveTab("active")}
              >
                Active Events ({events.length})
              </button>

              <button
                className={
                  activeTab === "past" ? "active" : ""
                }
                onClick={() => setActiveTab("past")}
              >
                Past Events ({pastEvents.length})
              </button>

              <button
                className={
                  activeTab === "deleted" ? "active" : ""
                }
                onClick={() => setActiveTab("deleted")}
              >
                Deleted Events ({deletedEvents.length})
              </button>

              <button
                className={
                  activeTab === "logs" ? "active" : ""
                }
                onClick={() => setActiveTab("logs")}
              >
                Activity Log
              </button>

            </div>
          </section>

          {/* -------------------- ACTIVE EVENTS -------------------- */}

          {activeTab === "active" && (
            <>

              <section
                className="admin-panel"
                id="event-form-panel"
              >

                <div className="panel-heading">

                  <div>
                    <h2>
                      {editingId !== null
                        ? "Edit Event"
                        : "Create an event"}
                    </h2>

                    <p>
                      Leave capacity empty for unlimited registrations.
                    </p>
                  </div>

                </div>

                <form
                  className="event-form"
                  onSubmit={saveEvent}
                >

                  <div className="form-field">
                    <label htmlFor="event-title">
                      Event title *
                    </label>

                    <input
                      id="event-title"
                      name="title"
                      value={form.title}
                      onChange={updateField}
                      maxLength={160}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="event-category">
                      Category *
                    </label>

                    <select
                      id="event-category"
                      name="category"
                      value={form.category}
                      onChange={updateField}
                      required
                    >
                      {[
                        "Technical",
                        "Cultural",
                        "Workshop",
                        "Sports",
                        "Literary",
                        "Academic",
                        "Other"
                      ].map(item => (
                        <option key={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label htmlFor="event-venue">
                      Venue *
                    </label>

                    <input
                      id="event-venue"
                      name="venue"
                      value={form.venue}
                      onChange={updateField}
                      maxLength={160}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="event-date">
                      Event date and time *
                    </label>

                    <input
                      id="event-date"
                      name="event_date"
                      type="datetime-local"
                      value={form.event_date}
                      onChange={updateField}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="registration-deadline">
                      Registration deadline
                    </label>

                    <input
                      id="registration-deadline"
                      name="registration_deadline"
                      type="datetime-local"
                      value={form.registration_deadline}
                      onChange={updateField}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="event-capacity">
                      Seat capacity
                    </label>

                    <input
                      id="event-capacity"
                      name="capacity"
                      type="number"
                      min="1"
                      step="1"
                      value={form.capacity}
                      onChange={updateField}
                      placeholder="Empty = unlimited"
                    />
                  </div>

                  <div className="form-field full-width">
                    <label htmlFor="event-description">
                      Description
                    </label>

                    <textarea
                      id="event-description"
                      name="description"
                      value={form.description}
                      onChange={updateField}
                      rows={4}
                    />
                  </div>

                  <div className="form-field full-width">
                    <label htmlFor="event-image">
                      Poster (optional)
                    </label>

                    <input
                      id="event-image"
                      name="image"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={updateField}
                    />

                    <small>
                      JPG, PNG or WebP. Maximum 5 MB.
                    </small>
                  </div>

                  <div className="form-actions full-width">

                    <button
                      type="submit"
                      className="primary-button"
                      disabled={busy}
                    >
                      {busy
                        ? "Saving..."
                        : editingId !== null
                          ? "Save Changes"
                          : "＋ Publish Event"}
                    </button>

                    {editingId !== null && (
                      <button
                        type="button"
                        className="refresh-button"
                        onClick={resetForm}
                      >
                        Cancel Edit
                      </button>
                    )}

                  </div>

                </form>

              </section>

              <section className="admin-panel">

                <div className="panel-heading">
                  <div>
                    <h2>Manage Active Events</h2>
                    <p>
                      Edit, delete, update posters and view attendees.
                    </p>
                  </div>
                </div>

                <div className="manage-list">

                  {events.length === 0 ? (
                    <p className="status-message">
                      No upcoming events available.
                    </p>
                  ) : (
                    events.map(event =>
                      renderEventCard(event, "active")
                    )
                  )}

                </div>

              </section>

            </>
          )}

          {/* -------------------- PAST EVENTS -------------------- */}

          {activeTab === "past" && (
            <section className="admin-panel">

              <div className="panel-heading">
                <div>
                  <h2>Past Events Archive</h2>
                  <p>
                    Completed events and their registrations.
                  </p>
                </div>
              </div>

              <div className="manage-list">

                {pastEvents.length === 0 ? (
                  <p className="status-message">
                    No past events available.
                  </p>
                ) : (
                  pastEvents.map(event =>
                    renderEventCard(event, "past")
                  )
                )}

              </div>

            </section>
          )}

          {/* -------------------- DELETED EVENTS -------------------- */}

          {activeTab === "deleted" && (
            <section className="admin-panel">

              <div className="panel-heading">
                <div>
                  <h2>Deleted Events</h2>
                  <p>
                    Restore events or permanently remove them.
                  </p>
                </div>
              </div>

              <div className="manage-list">

                {deletedEvents.length === 0 ? (
                  <p className="status-message">
                    Trash is empty. Deleted events will appear here.
                  </p>
                ) : (
                  deletedEvents.map(event =>
                    renderEventCard(event, "deleted")
                  )
                )}

              </div>

            </section>
          )}

          {/* -------------------- ACTIVITY LOG -------------------- */}

          {activeTab === "logs" && (
            <section className="admin-panel">

              <div className="panel-heading">
                <div>
                  <h2>Event Activity Log</h2>
                  <p>
                    Track administrative actions.
                  </p>
                </div>
              </div>

              {activityLogs.length === 0 ? (
                <p className="status-message">
                  No activity recorded yet.
                </p>
              ) : (

                <div className="attendee-table-wrap">

                  <table className="attendee-table">

                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Event</th>
                        <th>Admin</th>
                        <th>Description</th>
                        <th>Date</th>
                      </tr>
                    </thead>

                    <tbody>

                      {activityLogs.map(log => (
                        <tr key={log._id}>

                          <td>
                            <strong>{log.action}</strong>
                          </td>

                          <td>
                            {log.event_title || "—"}
                          </td>

                          <td>
                            {log.admin_email || "—"}
                          </td>

                          <td>
                            {log.description}
                          </td>

                          <td>
                            {formatDate(log.created_at)}
                          </td>

                        </tr>
                      ))}

                    </tbody>

                  </table>

                </div>
              )}

            </section>
          )}

          {/* -------------------- ATTENDEE MANAGEMENT -------------------- */}

          {attendeeEvent && (
            <section className="admin-panel">

              <div className="panel-heading">

                <div>
                  <h2>
                    Attendees: {attendeeEvent.title}
                  </h2>

                  <p>
                    {attendees.length} registered student(s)
                  </p>
                </div>

                <button
                  className="refresh-button"
                  onClick={() => setAttendeeEvent(null)}
                >
                  Close
                </button>

              </div>

              {attendees.length === 0 ? (
                <p className="status-message">
                  No registrations yet.
                </p>
              ) : (

                <div className="attendee-table-wrap">

                  <table className="attendee-table">

                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Registered At</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>

                      {attendees.map(person => (
                        <tr key={person.id}>

                          <td>{person.name}</td>

                          <td>{person.email}</td>

                          <td>
                            {formatDate(person.registered_at)}
                          </td>

                          <td>
                            <button
                              className="delete-button"
                              disabled={busy}
                              onClick={() => removeAttendee(person)}
                            >
                              Remove
                            </button>
                          </td>

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