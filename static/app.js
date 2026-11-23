const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

const state = {
  user: null,
  screen: "home",
  doctors: [],
  appointments: [],
  users: [],
  adminTab: "appointments",
  statusFilter: "all",
  loading: true,
};

const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  heart: '<path d="M20.8 8.8c0 5.2-8.8 10.2-8.8 10.2S3.2 14 3.2 8.8A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.8 2.4Z"/>',
  shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6"/>',
  stethoscope: '<path d="M6 3v5a4 4 0 0 0 8 0V3M4 3h4M12 3h4M10 12v2a4 4 0 0 0 8 0v-1"/><circle cx="18" cy="11" r="2"/><path d="M14 19h2a5 5 0 0 0 5-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  x: '<path d="m18 6-12 12M6 6l12 12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sparkle: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="m19 14 1 2.5 2.5 1-2.5 1L19 21l-1-2.5-2.5-1 2.5-1L19 14Z"/>',
  building: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M9 21V8h6v13M7 8h2M15 8h2M7 12h2M15 12h2M7 16h2M15 16h2"/>',
};

function icon(name, className = "") {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ""}</svg>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an unexpected response.");
  }
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function notify(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast${type === "error" ? " error" : ""}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "short", day: "numeric", year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatTime(value) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" })
    .format(new Date(2024, 0, 1, hours, minutes));
}

function avatarInitials(name = "") {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

function displayRole(role) {
  return role === "admin" ? "Administrator" : role.charAt(0).toUpperCase() + role.slice(1);
}

function homeUrl() {
  return state.user ? `#${state.user.role}` : "#home";
}

function header() {
  const guestActions = `
    <div class="nav-actions">
      <button class="button button-quiet" data-screen="login">Sign in</button>
      <button class="button button-primary" data-screen="register">Create account</button>
    </div>`;
  const userActions = `
    <div class="nav-actions">
      <button class="button button-outline button-small" data-action="logout">Sign out</button>
    </div>`;
  const links = state.user
    ? `<nav class="nav-links" aria-label="Main navigation">
         <a href="${homeUrl()}">Dashboard</a>
         ${state.user.role === "patient" ? '<button data-screen="book">Book appointment</button>' : ""}
       </nav>`
    : `<nav class="nav-links" aria-label="Main navigation">
         <a href="#home">Home</a>
         <a href="#how-it-works">How it works</a>
         <a href="#care">Our care</a>
       </nav>`;
  return `
    <header class="site-header">
      <a class="brand" href="${homeUrl()}" aria-label="CarePoint home">
        <span class="brand-mark">${icon("heart")}</span>CarePoint
      </a>
      ${links}
      ${state.user ? userActions : guestActions}
    </header>`;
}

function footer() {
  return `<footer class="site-footer"><span>© ${new Date().getFullYear()} <strong>CarePoint</strong> Health. Care that fits your life.</span><span>Thoughtful care, one visit at a time.</span></footer>`;
}

function heroIllustration() {
  return `<svg class="hero-illustration" viewBox="0 0 460 390" role="img" aria-label="A doctor ready to help a patient">
    <ellipse cx="227" cy="352" rx="175" ry="17" fill="#dce8df"/>
    <circle cx="230" cy="181" r="145" fill="#e1eee4"/>
    <circle cx="230" cy="181" r="112" fill="#d3e5d8"/>
    <path d="M130 320c10-77 43-116 103-116s97 41 106 116v22H130z" fill="#fff"/>
    <path d="M174 245h111l-17 99h-77z" fill="#f3f6f1"/>
    <path d="M198 205v42c0 24 19 43 42 43s42-19 42-43v-42z" fill="#c47d5d"/>
    <path d="M194 222c10 14 26 23 48 23 18 0 33-6 44-18v-27h-92z" fill="#ae684f"/>
    <ellipse cx="241" cy="132" rx="67" ry="78" fill="#d89972"/>
    <path d="M174 136c-9-53 16-99 72-99 50 0 73 38 63 92-8-8-14-21-19-40-26 24-66 37-115 35z" fill="#3c302b"/>
    <path d="M182 103c8-32 31-48 61-48 25 0 42 8 54 28-29-7-68 1-115 20z" fill="#44352f"/>
    <path d="M207 142c4-3 10-3 14 0M255 142c4-3 10-3 14 0" fill="none" stroke="#573d33" stroke-width="3" stroke-linecap="round"/>
    <path d="M233 151c-2 9-4 15-6 18 5 3 10 3 15 0" fill="none" stroke="#b8775c" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M218 181c13 10 27 10 40-1" fill="none" stroke="#8b493f" stroke-width="3" stroke-linecap="round"/>
    <path d="M203 202c5 13 19 22 37 22 17 0 31-9 37-22" fill="#fff"/>
    <path d="M218 219l23 24-16 18-21-41zM265 219l-24 24 17 18 22-41z" fill="#eef2ed"/>
    <path d="M241 243v45m-22-22 22 22 22-22" fill="none" stroke="#86a594" stroke-width="2"/>
    <path d="M148 297c-16 0-27 13-27 28v21h70v-20c0-16-12-29-28-29z" fill="#8bbda3"/>
    <path d="M319 288c16 0 29 13 29 29v29h-71v-27c0-17 13-31 31-31z" fill="#8bbda3"/>
    <path d="M168 300l22 10 4 36h-74l3-20c3-17 20-30 45-26zM308 296l-17 14-4 36h73l-3-23c-3-16-23-30-49-27z" fill="#8ebfa6"/>
    <path d="M169 302l32 23m103-26-32 26" stroke="#709e84" stroke-width="2"/>
    <circle cx="241" cy="275" r="12" fill="#fff"/><path d="M241 268v14m-7-7h14" stroke="#58a27d" stroke-width="3" stroke-linecap="round"/>
    <path d="M332 98c10-12 25-16 40-11-3 15-13 25-28 29-8 2-17 0-23-4z" fill="#8ebda3"/>
    <path d="M350 104c-13 12-20 29-20 48" fill="none" stroke="#79a98f" stroke-width="3" stroke-linecap="round"/>
    <path d="M96 191c-12-9-16-24-11-39 15 3 25 13 29 28 2 8 0 17-4 23z" fill="#8ebda3"/>
    <path d="M101 175c12 13 29 20 48 21" fill="none" stroke="#79a98f" stroke-width="3" stroke-linecap="round"/>
    <circle cx="358" cy="190" r="22" fill="#fff" opacity=".8"/><path d="m358 178 3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#e8b965"/>
  </svg>`;
}

function homePage() {
  return `${header()}
    <main>
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <div class="eyebrow"><span class="eyebrow-dot"></span> Your care, on your terms</div>
          <h1 id="hero-title">A healthier you starts <span>here.</span></h1>
          <p class="hero-description">Finding a doctor you trust should feel simple. Discover caring specialists and book an appointment that fits your life.</p>
          <div class="hero-buttons">
            <button class="button button-primary" data-screen="register">Find a doctor ${icon("arrow")}</button>
            <button class="button button-outline" data-screen="login">I have an account</button>
          </div>
          <div class="hero-proof">
            <div class="proof-avatars"><span class="proof-avatar">JD</span><span class="proof-avatar">AS</span><span class="proof-avatar">MK</span></div>
            <span>Trusted by patients on their path to better health</span>
          </div>
        </div>
        <div class="hero-art">
          ${heroIllustration()}
          <div class="floating-card top"><span class="float-icon">${icon("check")}</span><span class="float-copy"><strong>Care you can count on</strong><span>Every step of the way</span></span></div>
          <div class="floating-card bottom"><span class="float-icon">${icon("calendar")}</span><span class="float-copy"><strong>Easy appointment booking</strong><span>Choose a time that works</span></span></div>
        </div>
      </section>
      <section class="trust-strip" aria-label="CarePoint values">
        <span class="trust-label">Better care starts with trust</span>
        <div class="trust-items">
          <span>${icon("shield")} Private & secure</span>
          <span>${icon("heart")} Care that listens</span>
          <span>${icon("clock")} Your time matters</span>
          <span>${icon("users")} People first</span>
        </div>
      </section>
      <section class="section-shell" id="how-it-works">
        <div class="section-heading">
          <span class="eyebrow"><span class="eyebrow-dot"></span> A better way to feel better</span>
          <h2>Healthcare that works for you</h2>
          <p>From finding a specialist to managing your next visit, we make the little things feel easier.</p>
        </div>
        <div class="feature-grid" id="care">
          <article class="feature-card"><span class="feature-icon">${icon("users")}</span><h3>Find your fit</h3><p>Explore thoughtful doctor profiles and choose a specialist who understands what matters to you.</p></article>
          <article class="feature-card"><span class="feature-icon">${icon("calendar")}</span><h3>Book with ease</h3><p>Request a visit around your schedule and keep every appointment organized in one place.</p></article>
          <article class="feature-card"><span class="feature-icon">${icon("heart")}</span><h3>Feel looked after</h3><p>Keep in touch with your care team as your appointment moves from request to confirmation.</p></article>
        </div>
      </section>
    </main>${footer()}`;
}

function authPage(isRegister) {
  const title = isRegister ? "Create your account" : "Welcome back";
  const subtitle = isRegister
    ? "Join CarePoint and make your next step toward better health."
    : "Sign in to pick up right where you left off.";
  return `${header()}<main class="auth-layout">
    <aside class="auth-aside">
      <div><a class="brand" href="#home"><span class="brand-mark">${icon("heart")}</span>CarePoint</a>
        <div style="margin-top:42px"><span class="eyebrow"><span class="eyebrow-dot"></span> Here when you need us</span>
          <h2>A little more care, a lot less worry.</h2>
          <p>Your health journey deserves a place that feels simple, thoughtful, and all about you.</p></div>
      </div>
      <div class="auth-quote">“It finally feels easy to find the right care and keep everything in one place.”<strong>Alex M. · CarePoint patient</strong></div>
    </aside>
    <section class="auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title">${title}</h1><p class="auth-subtitle">${subtitle}</p>
      <form class="form-stack" id="${isRegister ? "register-form" : "login-form"}">
        ${isRegister ? `<div class="field"><label for="full-name">Full name</label><input id="full-name" name="full_name" autocomplete="name" placeholder="e.g. Alex Morgan" required maxlength="100" /></div>` : ""}
        <div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required maxlength="254" /></div>
        ${isRegister ? `<div class="field"><label for="phone">Phone number <span class="field-hint">(optional)</span></label><input id="phone" name="phone" type="tel" autocomplete="tel" placeholder="+1 (555) 000-0000" maxlength="40" /></div>` : ""}
        <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" placeholder="${isRegister ? "At least 8 characters" : "Enter your password"}" required minlength="${isRegister ? "8" : "1"}" /></div>
        ${isRegister ? '<span class="field-hint">Use at least 8 characters to keep your account secure.</span>' : ""}
        <button class="button button-primary" type="submit">${isRegister ? "Create my account" : "Sign in to CarePoint"} ${icon("arrow")}</button>
      </form>
      <p class="auth-switch">${isRegister ? "Already have an account?" : "New to CarePoint?"} <button class="text-link" data-screen="${isRegister ? "login" : "register"}">${isRegister ? "Sign in" : "Create an account"}</button></p>
      ${isRegister ? "" : `<div class="demo-box"><strong>Demo access for your project review</strong><br />Patient · patient@carepoint.test · Patient123!<br />Doctor · doctor@carepoint.test · Doctor123!<br />Admin · admin@carepoint.test · Admin123!</div>`}
    </section>
  </main>${footer()}`;
}

function statCard(symbol, label, value) {
  return `<article class="stat-card"><span class="stat-icon">${icon(symbol)}</span><div><span>${label}</span><strong>${value}</strong></div></article>`;
}

function statusBadge(status) {
  return `<span class="status status-${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function appointmentRows(appointments, viewerRole) {
  if (!appointments.length) {
    return `<div class="empty-state"><strong>Nothing on the calendar yet</strong>${viewerRole === "patient" ? "Your requested appointments will appear here." : "New appointment requests will appear here."}</div>`;
  }
  return `<div class="appointment-list">${appointments.map((appointment) => {
    const otherName = viewerRole === "patient" ? appointment.doctor_name : appointment.patient_name;
    const subline = viewerRole === "patient" ? appointment.doctor_specialty : appointment.patient_email;
    const cancellable = ["pending", "confirmed"].includes(appointment.status);
    const actions = viewerRole === "doctor" && appointment.status === "pending"
      ? `<button class="button button-primary button-small" data-action="update-status" data-id="${appointment.id}" data-status="confirmed">Confirm</button><button class="button button-outline button-small" data-action="update-status" data-id="${appointment.id}" data-status="cancelled">Decline</button>`
      : viewerRole === "doctor" && appointment.status === "confirmed"
        ? `<button class="button button-outline button-small" data-action="update-status" data-id="${appointment.id}" data-status="completed">Complete</button>`
        : viewerRole === "patient" && cancellable
          ? `<button class="button button-outline button-small" data-action="update-status" data-id="${appointment.id}" data-status="cancelled">Cancel</button>`
          : "";
    return `<article class="appointment-row">
      <div class="person-cell"><span class="person-avatar">${escapeHtml(avatarInitials(otherName))}</span><span class="person-copy"><strong>${escapeHtml(otherName)}</strong><span>${escapeHtml(subline || "")}</span></span></div>
      <div><span class="cell-primary">${escapeHtml(formatDate(appointment.appointment_date))}</span><span class="cell-secondary">${escapeHtml(formatTime(appointment.appointment_time))}</span></div>
      <div>${statusBadge(appointment.status)}</div>
      <div><span class="cell-primary">Visit reason</span><span class="cell-secondary">${escapeHtml(appointment.reason)}</span></div>
      <div class="row-actions">${actions}</div>
    </article>`;
  }).join("")}</div>`;
}

function patientDashboard() {
  const active = state.appointments.filter((item) => ["pending", "confirmed"].includes(item.status)).length;
  const next = state.appointments.find((item) => ["pending", "confirmed"].includes(item.status));
  const doctorsCount = state.doctors.length;
  return `${header()}<main class="dashboard-shell">
    <div class="page-heading"><div><span class="page-eyebrow">Your patient portal</span><h1>Good to see you, ${escapeHtml(state.user.full_name.split(" ")[0])}.</h1><p>Your care journey, all in one place.</p></div>
      <button class="button button-primary" data-screen="book">${icon("plus")} Book an appointment</button></div>
    <section class="dashboard-grid" aria-label="Appointment overview">
      ${statCard("calendar", "Total appointments", state.appointments.length)}
      ${statCard("clock", "Upcoming visits", active)}
      ${statCard("users", "Care team doctors", doctorsCount)}
    </section>
    <section class="panel"><div class="panel-heading"><div><h2>Your appointments</h2><p>Stay up to date with your care.</p></div>${next ? statusBadge(next.status) : ""}</div>
      ${appointmentRows(state.appointments, "patient")}
    </section>
  </main>${footer()}`;
}

function doctorAppointmentCards(appointments) {
  if (!appointments.length) return `<div class="empty-state"><strong>All caught up</strong>No appointment requests to review right now.</div>`;
  return `<div class="queue-list">${appointments.map((appointment) => {
    const actions = appointment.status === "pending"
      ? `<div class="row-actions"><button class="button button-primary button-small" data-action="update-status" data-id="${appointment.id}" data-status="confirmed">Confirm visit</button><button class="button button-outline button-small" data-action="update-status" data-id="${appointment.id}" data-status="cancelled">Decline</button></div>`
      : appointment.status === "confirmed"
        ? `<div class="row-actions"><button class="button button-outline button-small" data-action="update-status" data-id="${appointment.id}" data-status="completed">Mark complete</button></div>`
        : "";
    return `<article class="queue-card">
      <div class="queue-card-top"><div class="person-cell"><span class="person-avatar">${escapeHtml(avatarInitials(appointment.patient_name))}</span><span class="person-copy"><strong>${escapeHtml(appointment.patient_name)}</strong><span>${escapeHtml(appointment.patient_email)}</span></span></div>${statusBadge(appointment.status)}</div>
      <p>${escapeHtml(appointment.reason)}</p><div class="queue-meta"><span>${icon("calendar")}${escapeHtml(formatDate(appointment.appointment_date))}</span><span>${icon("clock")}${escapeHtml(formatTime(appointment.appointment_time))}</span></div>
      ${actions ? `<div style="margin-top:13px">${actions}</div>` : ""}
    </article>`;
  }).join("")}</div>`;
}

function availabilityForm() {
  const doctor = state.doctors.find((item) => item.id === state.user.id);
  const availability = doctor?.availability || { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], start: "09:00", end: "17:00" };
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return `<form class="availability-form" id="availability-form">
    <div class="field"><label>Working days</label><div class="days-grid">${days.map((day) => `<label class="day-chip"><input type="checkbox" name="days" value="${day}" ${availability.days.includes(day) ? "checked" : ""}/><span>${day}</span></label>`).join("")}</div></div>
    <div class="time-grid"><div class="field"><label for="start-time">From</label><input id="start-time" name="start" type="time" value="${escapeHtml(availability.start)}" required /></div><div class="field"><label for="end-time">Until</label><input id="end-time" name="end" type="time" value="${escapeHtml(availability.end)}" required /></div></div>
    <button class="button button-primary button-small" type="submit">Save availability</button>
  </form>`;
}

function doctorDashboard() {
  const pending = state.appointments.filter((item) => item.status === "pending").length;
  const confirmed = state.appointments.filter((item) => item.status === "confirmed").length;
  const completed = state.appointments.filter((item) => item.status === "completed").length;
  const doctor = state.doctors.find((item) => item.id === state.user.id);
  return `${header()}<main class="dashboard-shell">
    <div class="page-heading"><div><span class="page-eyebrow">${escapeHtml(doctor?.specialty || "Doctor")} workspace</span><h1>Good morning, ${escapeHtml(state.user.full_name.split(" ").slice(-1)[0])}.</h1><p>Here’s what’s happening with your patients.</p></div></div>
    <section class="dashboard-grid" aria-label="Practice overview">
      ${statCard("clock", "Awaiting review", pending)}
      ${statCard("calendar", "Confirmed visits", confirmed)}
      ${statCard("check", "Completed visits", completed)}
    </section>
    <div class="doctor-layout">
      <section class="panel"><div class="panel-heading"><div><h2>Appointment requests</h2><p>Review and manage your patient visits.</p></div></div>${doctorAppointmentCards(state.appointments)}</section>
      <section class="panel availability-panel"><div class="panel-heading"><div><h2>Your availability</h2><p>Patients can book during these hours.</p></div></div>${availabilityForm()}</section>
    </div>
  </main>${footer()}`;
}

function adminAppointmentsTable() {
  const options = ["all", "pending", "confirmed", "completed", "cancelled"];
  const appointments = state.statusFilter === "all" ? state.appointments : state.appointments.filter((item) => item.status === state.statusFilter);
  return `<section class="panel"><div class="panel-heading"><div><h2>Appointment activity</h2><p>Monitor and update patient appointment records.</p></div>
    <div class="toolbar"><label for="status-filter" class="field-hint">Filter:</label><select class="filter-select" id="status-filter">${options.map((status) => `<option value="${status}" ${state.statusFilter === status ? "selected" : ""}>${status === "all" ? "All statuses" : status.charAt(0).toUpperCase() + status.slice(1)}</option>`).join("")}</select></div>
  </div><div class="table-wrap"><table class="data-table"><thead><tr><th>Patient</th><th>Doctor</th><th>Appointment</th><th>Reason</th><th>Status</th><th>Update status</th></tr></thead><tbody>
    ${appointments.length ? appointments.map((item) => `<tr><td><span class="person-cell"><span class="person-avatar">${escapeHtml(avatarInitials(item.patient_name))}</span><span class="person-copy"><strong>${escapeHtml(item.patient_name)}</strong><span>${escapeHtml(item.patient_email)}</span></span></span></td><td>${escapeHtml(item.doctor_name)}<span class="cell-secondary">${escapeHtml(item.doctor_specialty)}</span></td><td>${escapeHtml(formatDate(item.appointment_date))}<span class="cell-secondary">${escapeHtml(formatTime(item.appointment_time))}</span></td><td>${escapeHtml(item.reason)}</td><td>${statusBadge(item.status)}</td><td><select class="filter-select" data-admin-status="${item.id}" aria-label="Update appointment status">${["pending", "confirmed", "completed", "cancelled"].map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></td></tr>`).join("") : '<tr><td colspan="6" class="table-empty">No appointments match this filter.</td></tr>'}
  </tbody></table></div></section>`;
}

function adminUsersTable() {
  const users = state.users;
  return `<section class="panel"><div class="panel-heading"><div><h2>Registered users</h2><p>Patient, doctor, and administrator accounts.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Specialty</th></tr></thead><tbody>
    ${users.length ? users.map((user) => `<tr><td><span class="person-cell"><span class="person-avatar">${escapeHtml(avatarInitials(user.full_name))}</span><span class="person-copy"><strong>${escapeHtml(user.full_name)}</strong><span>Account #${user.id}</span></span></span></td><td>${escapeHtml(user.email)}</td><td>${escapeHtml(user.phone || "—")}</td><td><span class="status status-${user.role === "admin" ? "confirmed" : "pending"}">${escapeHtml(displayRole(user.role))}</span></td><td>${escapeHtml(user.specialty || "—")}</td></tr>`).join("") : '<tr><td colspan="5" class="table-empty">No accounts have been registered yet.</td></tr>'}
  </tbody></table></div></section>`;
}

function doctorManagementTable() {
  return `<section class="panel"><div class="panel-heading"><div><h2>Doctor directory</h2><p>Doctor profiles and their current appointment schedules.</p></div><button class="button button-primary button-small" data-action="open-doctor-modal">${icon("plus")} Add a doctor</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Doctor</th><th>Specialty</th><th>Working days</th><th>Hours</th><th>Phone</th></tr></thead><tbody>
    ${state.doctors.map((doctor) => `<tr><td><span class="person-cell"><span class="person-avatar">${escapeHtml(avatarInitials(doctor.full_name))}</span><span class="person-copy"><strong>${escapeHtml(doctor.full_name)}</strong><span>Doctor #${doctor.id}</span></span></span></td><td>${escapeHtml(doctor.specialty)}</td><td>${escapeHtml(doctor.availability.days.join(", "))}</td><td>${escapeHtml(formatTime(doctor.availability.start))}–${escapeHtml(formatTime(doctor.availability.end))}</td><td>${escapeHtml(doctor.phone || "—")}</td></tr>`).join("") || '<tr><td colspan="5" class="table-empty">No doctor profiles are available yet.</td></tr>'}
  </tbody></table></div></section>`;
}

function addDoctorModal() {
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="doctor-modal-title">
    <div class="modal-heading"><div><h2 id="doctor-modal-title">Add a doctor</h2><p>Create a doctor account and profile. They can update their availability after signing in.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon("x")}</button></div>
    <form class="form-stack" id="doctor-form">
      <div class="field"><label for="doctor-name">Full name</label><input id="doctor-name" name="full_name" required maxlength="100" placeholder="Dr. Taylor Reed" /></div>
      <div class="field"><label for="doctor-email">Email address</label><input id="doctor-email" name="email" type="email" required maxlength="254" placeholder="doctor@example.com" /></div>
      <div class="field"><label for="doctor-specialty">Specialty</label><input id="doctor-specialty" name="specialty" required maxlength="100" placeholder="Family medicine" /></div>
      <div class="field"><label for="doctor-phone">Phone number</label><input id="doctor-phone" name="phone" type="tel" maxlength="40" placeholder="+1 (555) 000-0000" /></div>
      <div class="field"><label for="doctor-password">Temporary password</label><input id="doctor-password" name="password" type="password" required minlength="8" placeholder="At least 8 characters" /></div>
      <div class="modal-actions"><button class="button button-outline" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">Add doctor</button></div>
    </form>
  </section></div>`;
}

function adminDashboard() {
  const pending = state.appointments.filter((item) => item.status === "pending").length;
  const active = state.appointments.filter((item) => ["pending", "confirmed"].includes(item.status)).length;
  const patients = state.users.filter((user) => user.role === "patient").length;
  const tabContent = state.adminTab === "appointments"
    ? adminAppointmentsTable()
    : state.adminTab === "users" ? adminUsersTable() : doctorManagementTable();
  return `${header()}<main class="dashboard-shell">
    <div class="page-heading"><div><span class="page-eyebrow">System administration</span><h1>Welcome, ${escapeHtml(state.user.full_name.split(" ")[0])}.</h1><p>Manage your care community and keep appointments moving.</p></div></div>
    <section class="dashboard-grid" aria-label="System overview">
      ${statCard("calendar", "All appointments", state.appointments.length)}
      ${statCard("clock", "Awaiting review", pending)}
      ${statCard("users", "Registered patients", patients)}
    </section>
    <section class="panel"><div class="panel-heading"><div><h2>CarePoint administration</h2><p>${active} appointments are pending or confirmed right now.</p></div><div class="toolbar">
      <button class="button ${state.adminTab === "appointments" ? "button-primary" : "button-outline"} button-small" data-tab="appointments">Appointments</button>
      <button class="button ${state.adminTab === "users" ? "button-primary" : "button-outline"} button-small" data-tab="users">Users</button>
      <button class="button ${state.adminTab === "doctors" ? "button-primary" : "button-outline"} button-small" data-tab="doctors">Doctors</button>
    </div></div>${tabContent}</section>
  </main>${footer()}`;
}

function bookingPage() {
  const doctorOptions = state.doctors.map((doctor) => {
    return `<option value="${doctor.id}">${escapeHtml(doctor.full_name)} · ${escapeHtml(doctor.specialty)}</option>`;
  }).join("");
  return `${header()}<main class="auth-layout">
    <aside class="auth-aside"><div><a class="brand" href="${homeUrl()}"><span class="brand-mark">${icon("heart")}</span>CarePoint</a><div style="margin-top:42px"><span class="eyebrow"><span class="eyebrow-dot"></span> Make time for your health</span><h2>Good care begins with a conversation.</h2><p>Tell us what works for you. Your doctor will review your request and confirm your appointment.</p></div></div><div class="auth-quote">Your appointment starts as a request. You’ll see its status in your patient dashboard as soon as the care team reviews it.<strong>CarePoint · Appointment booking</strong></div></aside>
    <section class="auth-card"><span class="page-eyebrow">New appointment</span><h1 style="margin-top:9px">Let's find a time.</h1><p class="auth-subtitle">Choose a doctor and an available time for your visit.</p>
      ${state.doctors.length ? `<form class="form-stack" id="booking-form">
        <div class="field"><label for="doctor-id">Choose a doctor</label><select id="doctor-id" name="doctor_id" required><option value="">Select a doctor</option>${doctorOptions}</select></div>
        <div class="booking-hours" id="booking-hours" role="status">Choose a doctor to see their office hours.</div>
        <div class="field"><label for="appointment-date">Appointment date</label><input id="appointment-date" name="appointment_date" type="date" min="${new Date().toISOString().slice(0, 10)}" required /><span class="field-hint">Choose a future date that falls on your doctor's working days.</span></div>
        <div class="field"><label for="appointment-time">Preferred time</label><input id="appointment-time" name="appointment_time" type="time" step="60" aria-describedby="appointment-time-hint" required disabled /><span class="field-hint" id="appointment-time-hint">Select a doctor and working day to choose a time.</span></div>
        <div class="field"><label for="reason">Reason for visit</label><textarea id="reason" name="reason" required maxlength="500" placeholder="Let the doctor know what you'd like help with…"></textarea></div>
        <button class="button button-primary" type="submit">${icon("calendar")} Request appointment</button>
      </form>` : `<div class="empty-state"><strong>No doctors are listed yet</strong>Please check back after the care team adds doctor profiles.</div>`}
      <p class="auth-switch"><button class="text-link" data-screen="patient">← Back to your dashboard</button></p>
    </section>
  </main>${footer()}`;
}

function render() {
  if (state.loading) {
    app.innerHTML = `${header()}<main class="loading-placeholder">Getting your CarePoint workspace ready…</main>`;
    return;
  }
  if (state.user) {
    const roleScreen = state.user.role;
    if (!(state.user.role === "patient" && state.screen === "book")) {
      if (!["patient", "doctor", "admin"].includes(state.screen)) state.screen = roleScreen;
      if (state.screen === "home" || state.screen === "login" || state.screen === "register") state.screen = roleScreen;
    }
  } else if (["patient", "doctor", "admin", "book"].includes(state.screen)) {
    state.screen = "home";
  }
  try {
    const page = state.screen === "home" ? homePage()
      : state.screen === "login" ? authPage(false)
        : state.screen === "register" ? authPage(true)
          : state.screen === "book" ? bookingPage()
            : state.screen === "doctor" ? doctorDashboard()
              : state.screen === "admin" ? adminDashboard()
                : patientDashboard();
    app.innerHTML = page;
    updateBookingAvailability();
  } catch (error) {
    console.error("CarePoint could not render this view.", error);
    app.innerHTML = `${header()}<main class="dashboard-shell"><section class="panel"><div class="empty-state"><strong>We couldn't load this view.</strong>${escapeHtml(error.message)}</div></section></main>`;
  }
}

function updateBookingAvailability() {
  const doctorSelect = document.querySelector("#doctor-id");
  const dateInput = document.querySelector("#appointment-date");
  const timeInput = document.querySelector("#appointment-time");
  const hoursMessage = document.querySelector("#booking-hours");
  const timeHint = document.querySelector("#appointment-time-hint");
  if (!doctorSelect || !dateInput || !timeInput || !hoursMessage || !timeHint) return;

  const doctor = state.doctors.find((item) => item.id === Number(doctorSelect.value));
  const availability = doctor?.availability;
  if (!availability) {
    timeInput.disabled = true;
    timeInput.value = "";
    timeInput.removeAttribute("min");
    timeInput.removeAttribute("max");
    hoursMessage.textContent = "Choose a doctor to see their office hours.";
    hoursMessage.classList.remove("is-warning");
    timeHint.textContent = "Select a doctor and working day to choose a time.";
    return;
  }

  hoursMessage.textContent = `${doctor.full_name} is available ${availability.days.join(", ")} · ${formatTime(availability.start)}–${formatTime(availability.end)}.`;
  hoursMessage.classList.remove("is-warning");
  if (dateInput.value) {
    const [year, month, day] = dateInput.value.split("-").map(Number);
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(year, month - 1, day).getDay()];
    if (!availability.days.includes(weekday)) {
      timeInput.disabled = true;
      timeInput.value = "";
      hoursMessage.textContent = `${doctor.full_name} is not available on ${weekday}. Choose ${availability.days.join(", ")}.`;
      hoursMessage.classList.add("is-warning");
      timeHint.textContent = "This date is outside the doctor's working days.";
      return;
    }
  }

  const endMinutes = Number(availability.end.slice(0, 2)) * 60 + Number(availability.end.slice(3, 5));
  const lastBookableMinute = endMinutes - 1;
  timeInput.disabled = false;
  timeInput.min = availability.start;
  timeInput.max = `${String(Math.floor(lastBookableMinute / 60)).padStart(2, "0")}:${String(lastBookableMinute % 60).padStart(2, "0")}`;
  if (timeInput.value && (timeInput.value < availability.start || timeInput.value >= availability.end)) {
    timeInput.value = "";
  }
  timeHint.textContent = `Choose a time from ${formatTime(availability.start)} to before ${formatTime(availability.end)}.`;
}

async function refreshData() {
  const [doctorsData] = await Promise.all([api("/api/doctors")]);
  state.doctors = doctorsData.doctors;
  if (state.user) {
    const results = await Promise.all([
      api("/api/appointments"),
      state.user.role === "admin" ? api("/api/admin/users") : Promise.resolve({ users: [] }),
    ]);
    state.appointments = results[0].appointments;
    state.users = results[1].users;
  } else {
    state.appointments = [];
    state.users = [];
  }
}

function navigate(screen) {
  state.screen = screen;
  history.replaceState(null, "", screen === "home" ? "#home" : `#${screen}`);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.id === "register-form") {
      const { user } = await api("/api/register", { method: "POST", body: JSON.stringify(values) });
      state.user = user;
      state.screen = "patient";
      await refreshData();
      notify("Your patient account is ready. Welcome to CarePoint!");
      render();
    } else if (form.id === "login-form") {
      const { user } = await api("/api/login", { method: "POST", body: JSON.stringify(values) });
      state.user = user;
      state.screen = user.role;
      state.statusFilter = "all";
      await refreshData();
      notify(`Welcome back, ${user.full_name.split(" ")[0]}.`);
      render();
    } else if (form.id === "booking-form") {
      values.doctor_id = Number(values.doctor_id);
      await api("/api/appointments", { method: "POST", body: JSON.stringify(values) });
      state.screen = "patient";
      await refreshData();
      notify("Your appointment request has been sent to the doctor.");
      render();
    } else if (form.id === "availability-form") {
      const days = [...form.querySelectorAll('input[name="days"]:checked')].map((input) => input.value);
      const { availability } = await api("/api/availability", {
        method: "PUT",
        body: JSON.stringify({ days, start: values.start, end: values.end }),
      });
      state.doctors = state.doctors.map((doctor) => doctor.id === state.user.id ? { ...doctor, availability } : doctor);
      notify("Your availability has been updated.");
      render();
    } else if (form.id === "doctor-form") {
      await api("/api/admin/doctors", { method: "POST", body: JSON.stringify(values) });
      await refreshData();
      render();
      notify("The doctor profile and sign-in account have been created.");
    }
  } catch (error) {
    notify(error.message, "error");
  } finally {
    if (submitButton?.isConnected) submitButton.disabled = false;
  }
}

async function handleClick(event) {
  const screenButton = event.target.closest("[data-screen]");
  if (screenButton) {
    const screen = screenButton.dataset.screen;
    if (screen === "book" && !state.user) {
      notify("Please sign in as a patient to book an appointment.", "error");
      navigate("login");
      return;
    }
    if (screen === "book") await refreshData().catch((error) => notify(error.message, "error"));
    navigate(screen);
    return;
  }
  const tabButton = event.target.closest("[data-tab]");
  if (tabButton) {
    state.adminTab = tabButton.dataset.tab;
    render();
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  if (actionButton.dataset.action === "logout") {
    try {
      await api("/api/logout", { method: "POST" });
      state.user = null;
      state.screen = "home";
      state.appointments = [];
      state.users = [];
      render();
      notify("You have safely signed out.");
    } catch (error) {
      notify(error.message, "error");
    }
  } else if (actionButton.dataset.action === "update-status") {
    try {
      const status = actionButton.dataset.status;
      await api(`/api/appointments/${actionButton.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await refreshData();
      render();
      notify(`Appointment ${status}.`);
    } catch (error) {
      notify(error.message, "error");
    }
  } else if (actionButton.dataset.action === "open-doctor-modal") {
    app.insertAdjacentHTML("beforeend", addDoctorModal());
    document.querySelector("#doctor-name")?.focus();
  } else if (actionButton.dataset.action === "close-modal") {
    if (event.target === actionButton || !actionButton.closest(".modal-card")) {
      document.querySelector(".modal-backdrop")?.remove();
    }
  }
}

async function boot() {
  const hashScreen = window.location.hash.slice(1);
  if (["home", "login", "register", "book"].includes(hashScreen)) state.screen = hashScreen;
  state.loading = false;
  render();
  try {
    const session = await api("/api/session").catch((error) => {
      if (error.message !== "Please sign in to continue." && !error.message.includes("session has expired")) throw error;
      return { user: null };
    });
    state.user = session.user;
    if (state.user) {
      state.screen = state.user.role === "patient" && hashScreen === "book"
        ? "book"
        : state.user.role;
      await refreshData();
    }
    render();
  } catch (error) {
    render();
    notify(error.message, "error");
  }
}

document.addEventListener("click", handleClick);
document.addEventListener("submit", handleSubmit);
document.addEventListener("change", async (event) => {
  if (["doctor-id", "appointment-date"].includes(event.target.id)) updateBookingAvailability();
  if (event.target.id === "status-filter") {
    state.statusFilter = event.target.value;
    render();
  }
  if (event.target.matches("[data-admin-status]")) {
    try {
      await api(`/api/appointments/${event.target.dataset.adminStatus}`, {
        method: "PATCH",
        body: JSON.stringify({ status: event.target.value }),
      });
      await refreshData();
      render();
      notify("Appointment status updated.");
    } catch (error) {
      notify(error.message, "error");
      render();
    }
  }
});
window.addEventListener("popstate", () => {
  const screen = window.location.hash.slice(1);
  if (state.user) state.screen = state.user.role;
  else state.screen = ["home", "login", "register"].includes(screen) ? screen : "home";
  render();
});

boot();
