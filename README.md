# CarePoint — Doctor Appointment Management System

A complete, local-first web application for requesting and managing doctor
appointments. Built with Python's standard-library HTTP server, SQLite, and
plain HTML, CSS, and JavaScript. No package installation or database server is
required.

## Run the application

From this directory, run:

```powershell
python server.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in a browser. The SQLite
database (`doctor_appointments.db`) is created in this folder on first start
and is excluded from version control.

To select a different local port or database path:

```powershell
$env:DOCTOR_APP_PORT = "8080"
$env:DOCTOR_APP_DB = "C:\path\to\carepoint.sqlite3"
python server.py
```

## Demonstration accounts

| Role | Email | Password |
|---|---|---|
| Patient | `patient@carepoint.test` | `Patient123!` |
| Doctor | `doctor@carepoint.test` | `Doctor123!` |
| Administrator | `admin@carepoint.test` | `Admin123!` |

These accounts and a sample appointment are seeded when the database is first
created. For a clean demonstration database, stop the server, remove
`doctor_appointments.db`, and start the application again.

## Supervisor screenshots

The six requested screens are saved in [screenshots/](./screenshots/):

1. [Homepage](./screenshots/01-homepage.png)
2. [Patient registration](./screenshots/02-patient-registration.png)
3. [Login](./screenshots/03-login.png)
4. [Book appointment](./screenshots/04-book-appointment.png)
5. [Doctor dashboard](./screenshots/05-doctor-dashboard.png)
6. [Admin panel](./screenshots/06-admin-panel.png)

Dashboard and booking captures use the same sample patient, doctor, and initial
appointment as the first-run seed data; they are presentation screenshots and
do not make changes to the live database.

## Implemented functionality

- Patient sign-up and sign-in; staff-only doctor/admin access.
- Password hashing and expiring, server-side sessions using HTTP-only cookies.
- Doctor directory with specialty, contact information, working days, and hours.
- Appointment requests with future-date, availability, and time-slot validation.
- Patient history and cancellation of pending/confirmed appointments.
- Doctor review, confirmation, decline, completion, and availability updates.
- Administrative appointment status management, user directory, and doctor setup.
- Responsive home, registration, login, patient, doctor, booking, and admin views.
- SQLite relations, foreign-key constraints, status checks, and unique appointment slots.

## Data model

`users` stores patient and staff accounts; `doctors` adds specialty and
availability to a doctor account; `appointments` links a patient to a doctor
with its scheduled date, time, reason, and status; `sessions` stores hashed
session tokens and their expiry. Foreign keys and unique doctor/time slots
protect referential integrity and avoid double booking.

## Testing

Run the automated API and workflow tests with:

```powershell
python -m unittest discover -s tests -v
```

The test suite covers seeded doctor availability, registration and sessions,
appointment creation, availability enforcement, role-based access, doctor
confirmation, invalid login, and administrative doctor creation.

## Scope and deployment

This project is suitable for local demonstration and academic evaluation. It
does not claim to meet clinical, privacy-regulation, production security, or
health-record compliance requirements. Before public deployment, add HTTPS,
CSRF protection, secure cookie settings, migrations, backups, audit logging,
deployment secrets, and jurisdiction-specific privacy/security controls.

## GitHub Pages

The static project landing page is in [docs/index.html](./docs/index.html).
GitHub Pages can publish that overview, but it cannot run this application's
Python HTTP server or SQLite database. To use the appointment workflows, run
the application locally with `python server.py` or deploy its backend to a
separate Python-capable host.

After creating the GitHub repository, select **Settings > Pages > GitHub
Actions** to publish the landing page. The deployment workflow publishes the
contents of `docs/` whenever changes are pushed to `main`.
