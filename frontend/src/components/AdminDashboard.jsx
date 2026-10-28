
import { useEffect, useState } from "react";

export default function AdminDashboard({ api, onBack }) {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploadingId, setUploadingId] = useState(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Technical",
    venue: "",
    event_date: "",
    image: null,
  });

  async function loadEvents() {
    try {
      const response = await fetch(`${api}/api/events`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not load events.");
      }

      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not load events.");
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${api}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed.");
      }

      // Backend response contains admin.role, not data.role.
      const receivedToken = data.token;
      const receivedRole = String(
        data.admin?.role || data.role || data.user?.role || ""
      ).trim().toLowerCase();

      if (!receivedToken) {
        throw new Error("Login response did not contain a token.");
      }

      if (receivedRole !== "admin") {
        throw new Error(
          `Admin access denied. Received role: ${receivedRole || "missing"}.`
        );
      }

      setToken(receivedToken);
      setPassword("");
      setMessage("Login successful! Welcome to Campus Pulse.");

      await loadEvents();
    } catch (err) {
      setError(err.message || "Unable to log in.");
    } finally {
      setLoading(false);
    }
  }

  function updateField(e) {
    const { name, value, files } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: name === "image" ? files?.[0] || null : value,
    }));
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const body = new FormData();
      body.append("title", form.title.trim());
      body.append("description", form.description.trim());
      body.append("category", form.category);
      body.append("venue", form.venue.trim());
      body.append("event_date", form.event_date);

      if (form.image) {
        body.append("image", form.image);
      }

      const response = await fetch(`${api}/api/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not create event.");
      }

      setMessage("Event created successfully!");

      setForm({
        title: "",
        description: "",
        category: "Technical",
        venue: "",
        event_date: "",
        image: null,
      });

      e.target.reset();
      await loadEvents();
    } catch (err) {
      setError(err.message || "Could not create event.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePosterUpload(eventId, file) {
    if (!file) return;

    setUploadingId(eventId);
    setMessage("");
    setError("");

    try {
      const body = new FormData();
      body.append("image", file);

      const response = await fetch(
        `${api}/api/events/${eventId}/image`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Poster upload failed.");
      }

      setMessage(`Poster updated for event #${eventId}.`);
      await loadEvents();
    } catch (err) {
      setError(err.message || "Poster upload failed.");
    } finally {
      setUploadingId(null);
    }
  }

  function handleLogout() {
    setToken("");
    setEmail("");
    setPassword("");
    setMessage("");
    setError("");
  }

  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <button className="back-button" onClick={onBack}>
          ← Back to website
        </button>

        <div className="brand">
          <span className="brand-icon">C</span>
          <span>
            Campus<span className="brand-accent">Pulse</span>
          </span>
        </div>

        {token ? (
          <button className="admin-button" onClick={handleLogout}>
            Log out
          </button>
        ) : (
          <span className="admin-status">ADMIN PORTAL</span>
        )}
      </header>

      {!token ? (
        <main className="login-layout">
          <section className="login-intro">
            <span className="eyebrow">CAMPUS PULSE MANAGEMENT</span>
            <h1>
              Everything happening on campus, managed in one place.
            </h1>
            <p>
              Sign in to publish events, upload posters and keep your
              campus community updated.
            </p>

            <div className="login-feature">
              <span>✓</span> Publish campus events
            </div>
            <div className="login-feature">
              <span>✓</span> Manage event posters
            </div>
            <div className="login-feature">
              <span>✓</span> Keep event information updated
            </div>
          </section>

          <form className="login-card" onSubmit={handleLogin}>
            <span className="eyebrow">WELCOME BACK</span>
            <h2>Admin Login</h2>
            <p>Enter your administrator credentials.</p>

            <label htmlFor="admin-email">Email address</label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="username"
              required
            />

            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />

            {error && <div className="admin-alert error">{error}</div>}
            {message && <div className="admin-alert success">{message}</div>}

            <button
              type="submit"
              className="primary-button full-button"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In →"}
            </button>

            <p className="login-note">
              Only accounts with administrator privileges can manage events.
            </p>
          </form>
        </main>
      ) : (
        <main className="dashboard-main">
          <div className="dashboard-heading">
            <div>
              <span className="eyebrow">ADMINISTRATION</span>
              <h1>Dashboard</h1>
              <p>Manage your campus events from one place.</p>
            </div>
            <span className="logged-in-label">● Admin signed in</span>
          </div>

          {error && <div className="admin-alert error">{error}</div>}
          {message && <div className="admin-alert success">{message}</div>}

          <section className="stats-grid">
            <article className="stat-card">
              <span>Total events</span>
              <strong>{events.length}</strong>
              <small>Events in the database</small>
            </article>

            <article className="stat-card">
              <span>With posters</span>
              <strong>
                {events.filter((event) => event.image_url).length}
              </strong>
              <small>Events with an image URL</small>
            </article>

            <article className="stat-card">
              <span>Without posters</span>
              <strong>
                {events.filter((event) => !event.image_url).length}
              </strong>
              <small>Events needing a poster</small>
            </article>
          </section>

          <section className="admin-panel">
            <div className="panel-heading">
              <div>
                <h2>Create an event</h2>
                <p>Add an event and optionally upload its poster.</p>
              </div>
            </div>

            <form className="event-form" onSubmit={handleCreateEvent}>
              <div className="form-field">
                <label htmlFor="event-title">Event title *</label>
                <input
                  id="event-title"
                  name="title"
                  value={form.title}
                  onChange={updateField}
                  maxLength={160}
                  placeholder="e.g. Annual Tech Fest"
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="event-category">Category *</label>
                <select
                  id="event-category"
                  name="category"
                  value={form.category}
                  onChange={updateField}
                  required
                >
                  <option>Technical</option>
                  <option>Cultural</option>
                  <option>Workshop</option>
                  <option>Sports</option>
                  <option>Literary</option>
                  <option>Academic</option>
                  <option>Other</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="event-venue">Venue *</label>
                <input
                  id="event-venue"
                  name="venue"
                  value={form.venue}
                  onChange={updateField}
                  maxLength={160}
                  placeholder="Event location"
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="event-date">Date and time *</label>
                <input
                  id="event-date"
                  name="event_date"
                  type="datetime-local"
                  value={form.event_date}
                  onChange={updateField}
                  required
                />
              </div>

              <div className="form-field full-width">
                <label htmlFor="event-description">Description</label>
                <textarea
                  id="event-description"
                  name="description"
                  value={form.description}
                  onChange={updateField}
                  rows={4}
                  placeholder="Describe the event..."
                />
              </div>

              <div className="form-field full-width">
                <label htmlFor="event-image">
                  Event poster (JPG, PNG or WebP)
                </label>
                <input
                  id="event-image"
                  name="image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={updateField}
                />
                <small>Maximum file size: 5 MB.</small>
              </div>

              <div className="form-actions full-width">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={loading}
                >
                  {loading ? "Saving event..." : "＋ Publish Event"}
                </button>
              </div>
            </form>
          </section>

          <section className="admin-panel">
            <div className="panel-heading">
              <div>
                <h2>Manage existing events</h2>
                <p>Upload a replacement poster for any event.</p>
              </div>
              <button className="refresh-button" onClick={loadEvents}>
                ↻ Refresh
              </button>
            </div>

            {events.length === 0 ? (
              <p className="status-message">No events found.</p>
            ) : (
              <div className="manage-list">
                {events.map((event) => (
                  <article className="manage-event" key={event.id}>
                    {event.image_url ? (
                      <img
                        className="manage-thumbnail"
                        src={
                          event.image_url.startsWith("http")
                            ? event.image_url
                            : `${api}${event.image_url.startsWith("/") ? "" : "/"}${event.image_url}`
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
                        #{event.id} · {event.category || "Uncategorised"}
                      </span>
                      <small>{event.venue || "Venue not specified"}</small>
                    </div>

                    <label className="upload-button">
                      {uploadingId === event.id ? "Uploading..." : "Change poster"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploadingId !== null}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePosterUpload(event.id, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
