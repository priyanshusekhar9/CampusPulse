
import { useEffect, useState } from "react";
import "./App.css";
import AdminDashboard from "./components/AdminDashboard";

const API = "http://localhost:3000";

function App() {
  const [page, setPage] = useState("home");
  const [student, setStudent] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("campusPulseStudent") || "null");
    } catch {
      return null;
    }
  });

  function handleStudentLogin(data) {
    const account = { token: data.token, user: data.user };
    sessionStorage.setItem("campusPulseStudent", JSON.stringify(account));
    setStudent(account);
    setPage("home");
  }

  function logoutStudent() {
    sessionStorage.removeItem("campusPulseStudent");
    setStudent(null);
    setPage("home");
  }

  if (page === "admin") {
    return <AdminDashboard api={API} onBack={() => setPage("home")} />;
  }

  if (page === "student-auth") {
    return (
      <StudentAuth
        api={API}
        onBack={() => setPage("home")}
        onSuccess={handleStudentLogin}
      />
    );
  }

  if (page === "registrations") {
    return (
      <MyRegistrations
        api={API}
        student={student}
        onBack={() => setPage("home")}
      />
    );
  }

  return (
    <div className="app">
      <header className="navbar">
        <a className="brand" href="#home">
          <span className="brand-icon">C</span>
          <span>Campus<span className="brand-accent">Pulse</span></span>
        </a>

        <nav className="nav-links">
          <a href="#home">Home</a>
          <a href="#events">Explore Events</a>

          {student ? (
            <>
              <button className="admin-button" onClick={() => setPage("registrations")}>
                My Registrations
              </button>
              <button className="admin-button" onClick={logoutStudent}>
                Log out
              </button>
            </>
          ) : (
            <button className="admin-button" onClick={() => setPage("student-auth")}>
              Student Login
            </button>
          )}

          <button className="admin-button" onClick={() => setPage("admin")}>
            Admin Login
          </button>
        </nav>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="hero-content">
            <span className="eyebrow">YOUR CAMPUS. YOUR COMMUNITY.</span>
            <h1>
              Every Campus Moment,
              <br />
              <span>All in One Place.</span>
            </h1>
            <p>
              Discover college events, explore new interests and never miss
              a moment happening on your campus.
            </p>
            <a className="primary-button" href="#events">
              Explore Events <span>→</span>
            </a>
          </div>

          <div className="hero-art">
            <div className="art-circle circle-one" />
            <div className="art-circle circle-two" />
            <div className="hero-card">
              <span className="hero-card-icon">✦</span>
              <p>Make memories.</p>
              <h3>Be part of<br />something bigger.</h3>
              <span className="hero-card-bottom">CAMPUS PULSE 2026</span>
            </div>
          </div>
        </section>

        <section className="events-section" id="events">
          <div className="section-heading">
            <div>
              <span className="eyebrow">WHAT'S HAPPENING</span>
              <h2>Explore Campus Events</h2>
              <p>Find your next favourite campus experience.</p>
            </div>
          </div>
          <EventList
            api={API}
            student={student}
            onLogin={() => setPage("student-auth")}
          />
        </section>
      </main>

      <footer className="footer">
        <a className="brand" href="#home">
          <span className="brand-icon">C</span>
          <span>Campus<span className="brand-accent">Pulse</span></span>
        </a>
        <p>Connecting students through campus experiences.</p>
        <span>© 2026 Campus Pulse</span>
      </footer>
    </div>
  );
}

function StudentAuth({ api, onBack, onSuccess }) {
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `${api}/api/auth/${isSignup ? "register" : "login"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isSignup ? { name: name.trim() } : {}),
            email: email.trim(),
            password,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Authentication failed.");
      if (!data.token || !data.user || data.user.role !== "student") {
        throw new Error("Student account response was invalid.");
      }

      onSuccess(data);
    } catch (err) {
      setError(err.message || "Could not connect to the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-layout">
      <section className="login-intro">
        <span className="eyebrow">CAMPUS PULSE COMMUNITY</span>
        <h1>Your next campus experience starts here.</h1>
        <p>Sign in or create a student account to register for events.</p>
        <button className="back-button" onClick={onBack}>← Back to website</button>
      </section>

      <form className="login-card" onSubmit={submit}>
        <span className="eyebrow">{isSignup ? "JOIN THE COMMUNITY" : "WELCOME BACK"}</span>
        <h2>{isSignup ? "Student Sign Up" : "Student Login"}</h2>
        <p>{isSignup ? "Create your student account." : "Sign in to manage your registrations."}</p>

        {isSignup && (
          <>
            <label htmlFor="student-name">Full name</label>
            <input
              id="student-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoComplete="name"
              required
            />
          </>
        )}

        <label htmlFor="student-email">Email address</label>
        <input
          id="student-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <label htmlFor="student-password">Password</label>
        <input
          id="student-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          maxLength={72}
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
        />

        {error && <div className="admin-alert error">{error}</div>}

        <button className="primary-button full-button" disabled={busy} type="submit">
          {busy ? "Please wait..." : isSignup ? "Create Account →" : "Sign In →"}
        </button>

        <p className="login-note">
          {isSignup ? "Already registered?" : "New to Campus Pulse?"}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setIsSignup((value) => !value);
              setError("");
            }}
          >
            {isSignup ? "Log in" : "Create an account"}
          </button>
        </p>
      </form>
    </main>
  );
}

function EventList({ api, student, onLogin }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [refreshKey, setRefreshKey] = useState(0);
  const [registeringId, setRegisteringId] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`${api}/api/events`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Unable to load events.");
        if (!cancelled) setEvents(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not connect to the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadEvents();
    return () => { cancelled = true; };
  }, [api, refreshKey]);

  const categories = [
    "All",
    ...new Set(events.map((event) => event.category).filter(Boolean)),
  ];

  const filtered = events.filter((event) => {
    const text = [event.title, event.description, event.venue, event.category]
      .join(" ")
      .toLowerCase();

    return text.includes(search.toLowerCase()) &&
      (category === "All" || event.category === category);
  });

  async function register(eventId) {
    if (!student?.token) {
      onLogin();
      return;
    }

    setRegisteringId(eventId);
    setNotice("");
    setError("");

    try {
      const response = await fetch(`${api}/api/events/${eventId}/register`, {
        method: "POST",
        headers: { Authorization: `Bearer ${student.token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Registration failed.");

      setNotice(data.message || "Registration successful!");
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err.message || "Could not register for this event.");
    } finally {
      setRegisteringId(null);
    }
  }

  return (
    <div className="events-content">
      <div className="event-filters">
        <input
          type="search"
          placeholder="Search events or venues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search events"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter events by category"
        >
          {categories.map((item) => <option key={item}>{item}</option>)}
        </select>
        <button className="refresh-button" onClick={() => setRefreshKey((v) => v + 1)}>
          ↻ Refresh
        </button>
      </div>

      {notice && <div className="admin-alert success">{notice}</div>}
      {loading && <p className="status-message">Loading events...</p>}

      {!loading && error && (
        <div className="error-message">
          {error}
          <button onClick={() => setRefreshKey((v) => v + 1)}>Try again</button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="status-message">No matching events found.</p>
      )}

      {!loading && !error && (
        <div className="events-grid">
          {filtered.map((event) => {
            const capacity = event.capacity == null ? null : Number(event.capacity);
            const registered = Number(event.registered_count || 0);
            const remaining = capacity === null ? null : Math.max(0, capacity - registered);
            const full = remaining !== null && remaining === 0;
            const eventPassed = event.event_date &&
              new Date(event.event_date).getTime() < Date.now();

            return (
              <article className="event-card" key={event.id}>
                {event.image_url ? (
                  <img
                    className="event-image"
                    src={event.image_url.startsWith("http")
                      ? event.image_url
                      : `${api}${event.image_url.startsWith("/") ? "" : "/"}${event.image_url}`}
                    alt={event.title}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  <div className="event-image-placeholder">
                    <span>{event.category || "CAMPUS EVENT"}</span>
                    <small>Poster coming soon</small>
                  </div>
                )}

                <div className="event-card-body">
                  <span className="category-label">{event.category || "Campus Event"}</span>
                  <h3>{event.title}</h3>
                  <p className="event-description">
                    {event.description || "Join us for an exciting campus experience."}
                  </p>

                  <div className="event-meta">
                    <span>⌖ {event.venue || "Campus"}</span>
                    <span>
                      ◷ {event.event_date
                        ? new Date(event.event_date).toLocaleString("en-IN")
                        : "Date to be announced"}
                    </span>
                  </div>

                  {capacity === null ? (
                    <p className="seat-status">
                      ♾ Unlimited registrations · {registered} registered
                    </p>
                  ) : (
                    <p className="seat-status">
                      {remaining} seat(s) remaining · {registered}/{capacity} registered
                    </p>
                  )}

                  <button
                    className="primary-button event-register-button"
                    disabled={registeringId === event.id || full || Boolean(eventPassed)}
                    onClick={() => register(event.id)}
                  >
                    {registeringId === event.id
                      ? "Registering..."
                      : eventPassed
                        ? "Event has ended"
                        : full
                          ? "Event Full"
                          : student ? "Register for Event →" : "Log in to Register →"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MyRegistrations({ api, student, onBack }) {
  const [registrations, setRegistrations] = useState([]);
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancelId, setCancelId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    if (!student?.token) {
      setError("Please log in with your student account.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const headers = { Authorization: `Bearer ${student.token}` };

      const [profileResponse, registrationResponse] = await Promise.all([
        fetch(`${api}/api/auth/me`, { headers }),
        fetch(`${api}/api/my-registrations`, { headers }),
      ]);

      const profileData = await profileResponse.json();
      const registrationData = await registrationResponse.json();

      if (!profileResponse.ok) {
        throw new Error(profileData.message || "Could not load profile.");
      }
      if (!registrationResponse.ok) {
        throw new Error(registrationData.message || "Could not load registrations.");
      }

      setProfile(profileData.user);
      setName(profileData.user.name || "");
      setRegistrations(Array.isArray(registrationData) ? registrationData : []);
    } catch (err) {
      setError(err.message || "Could not load your account.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [api, student?.token]);

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`${api}/api/auth/me`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${student.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Profile update failed.");

      setProfile(data.user);
      setName(data.user.name);
      setMessage("Profile updated successfully.");
    } catch (err) {
      setError(err.message || "Could not update profile.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelRegistration(event) {
    if (!window.confirm(`Cancel your registration for "${event.title}"?`)) return;

    setCancelId(event.event_id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `${api}/api/my-registrations/${event.event_id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${student.token}` },
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Cancellation failed.");

      setMessage(data.message || "Registration cancelled.");
      setRegistrations((old) =>
        old.filter((item) => item.event_id !== event.event_id)
      );
    } catch (err) {
      setError(err.message || "Could not cancel registration.");
    } finally {
      setCancelId(null);
    }
  }

  return (
    <main className="dashboard-main">
      <button className="back-button" onClick={onBack}>← Back to events</button>

      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">YOUR CAMPUS ACTIVITY</span>
          <h1>My Student Portal</h1>
          <p>Manage your profile and event registrations.</p>
        </div>
      </div>

      {error && <div className="admin-alert error">{error}</div>}
      {message && <div className="admin-alert success">{message}</div>}

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <h2>My Profile</h2>
            <p>Your account details.</p>
          </div>
        </div>

        {loading ? (
          <p className="status-message">Loading your profile...</p>
        ) : profile ? (
          <form className="event-form" onSubmit={saveProfile}>
            <div className="form-field">
              <label htmlFor="profile-name">Full name</label>
              <input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="profile-email">Email address</label>
              <input id="profile-email" value={profile.email} readOnly />
            </div>

            <div className="form-actions full-width">
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <h2>My Registrations</h2>
            <p>{registrations.length} event(s) currently registered.</p>
          </div>
          <button className="refresh-button" onClick={loadData} disabled={loading}>
            ↻ Refresh
          </button>
        </div>

        {!loading && registrations.length === 0 ? (
          <p className="status-message">
            You haven't registered for any events yet. Explore events to get started!
          </p>
        ) : (
          <div className="events-grid">
            {registrations.map((event) => (
              <article className="event-card" key={event.event_id}>
                {event.image_url && (
                  <img
                    className="event-image"
                    src={event.image_url.startsWith("http")
                      ? event.image_url
                      : `${api}${event.image_url}`}
                    alt={event.title}
                  />
                )}

                <div className="event-card-body">
                  <span className="category-label">{event.category}</span>
                  <h3>{event.title}</h3>
                  <p>⌖ {event.venue}</p>
                  <p>
                    ◷ {event.event_date
                      ? new Date(event.event_date).toLocaleString("en-IN")
                      : "Date to be announced"}
                  </p>
                  <span className="logged-in-label">✓ Registered</span>

                  <button
                    className="delete-button cancel-registration-button"
                    disabled={cancelId === event.event_id}
                    onClick={() => cancelRegistration(event)}
                  >
                    {cancelId === event.event_id
                      ? "Cancelling..."
                      : "Cancel Registration"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
