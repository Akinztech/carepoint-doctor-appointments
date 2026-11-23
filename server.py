import hashlib
import json
import os
import re
import secrets
import sqlite3
import traceback
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
DB_PATH = Path(os.environ.get("DOCTOR_APP_DB", ROOT / "doctor_appointments.db"))
SESSION_DAYS = 7
WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
PASSWORD_ITERATIONS = 310_000


class APIError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS
    )
    return f"{salt.hex()}:{digest.hex()}"


def verify_password(password, stored_hash):
    try:
        salt_hex, digest_hex = stored_hash.split(":", maxsplit=1)
        salt = bytes.fromhex(salt_hex)
    except (ValueError, AttributeError):
        return False
    actual = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS
    )
    return secrets.compare_digest(actual.hex(), digest_hex)


@contextmanager
def connect_db():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize_database():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                phone TEXT NOT NULL DEFAULT '',
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS doctors (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                specialty TEXT NOT NULL,
                availability TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS appointments (
                id INTEGER PRIMARY KEY,
                patient_id INTEGER NOT NULL REFERENCES users(id),
                doctor_id INTEGER NOT NULL REFERENCES doctors(user_id),
                appointment_date TEXT NOT NULL,
                appointment_time TEXT NOT NULL,
                reason TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS appointments_patient_idx
                ON appointments(patient_id, appointment_date);
            CREATE INDEX IF NOT EXISTS appointments_doctor_idx
                ON appointments(doctor_id, appointment_date);
            CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_slot_idx
                ON appointments(doctor_id, appointment_date, appointment_time)
                WHERE status IN ('pending', 'confirmed');
            """
        )
        if db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            return

        patient_id = db.execute(
            """INSERT INTO users (full_name, email, phone, password_hash, role)
               VALUES (?, ?, ?, ?, 'patient')""",
            (
                "Olivia Carter",
                "patient@carepoint.test",
                "+1 (555) 010-2030",
                hash_password("Patient123!"),
            ),
        ).lastrowid
        doctor_id = db.execute(
            """INSERT INTO users (full_name, email, phone, password_hash, role)
               VALUES (?, ?, ?, ?, 'doctor')""",
            (
                "Dr. Maya Johnson",
                "doctor@carepoint.test",
                "+1 (555) 010-2040",
                hash_password("Doctor123!"),
            ),
        ).lastrowid
        admin_id = db.execute(
            """INSERT INTO users (full_name, email, phone, password_hash, role)
               VALUES (?, ?, ?, ?, 'admin')""",
            (
                "Jordan Lee",
                "admin@carepoint.test",
                "+1 (555) 010-2000",
                hash_password("Admin123!"),
            ),
        ).lastrowid
        availability = {"days": WEEKDAYS[1:6], "start": "09:00", "end": "17:00"}
        db.execute(
            "INSERT INTO doctors (user_id, specialty, availability) VALUES (?, ?, ?)",
            (doctor_id, "Cardiology", json.dumps(availability)),
        )
        tomorrow = date.today() + timedelta(days=1)
        while tomorrow.weekday() >= 5:
            tomorrow += timedelta(days=1)
        db.execute(
            """INSERT INTO appointments
               (patient_id, doctor_id, appointment_date, appointment_time, reason, status)
               VALUES (?, ?, ?, ?, ?, 'pending')""",
            (
                patient_id,
                doctor_id,
                tomorrow.isoformat(),
                "10:30",
                "A routine heart health consultation.",
            ),
        )
        assert patient_id and doctor_id and admin_id


def public_user(user):
    return {
        "id": user["id"],
        "full_name": user["full_name"],
        "email": user["email"],
        "phone": user["phone"],
        "role": user["role"],
    }


def require_text(data, field, label, maximum=200):
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        raise APIError(HTTPStatus.BAD_REQUEST, f"{label} is required.")
    value = value.strip()
    if len(value) > maximum:
        raise APIError(HTTPStatus.BAD_REQUEST, f"{label} is too long.")
    return value


class DoctorAppointmentHandler(BaseHTTPRequestHandler):
    server_version = "CarePoint/1.0"

    def do_GET(self):
        self.route_request()

    def do_POST(self):
        self.route_request()

    def do_PATCH(self):
        self.route_request()

    def do_PUT(self):
        self.route_request()

    def do_DELETE(self):
        self.route_request()

    def route_request(self):
        try:
            request = urlparse(self.path)
            if request.path.startswith("/api/"):
                self.handle_api(request.path)
            else:
                self.handle_static(request.path)
        except APIError as error:
            self.send_json(error.status, {"error": error.message})
        except sqlite3.IntegrityError as error:
            message = str(error).lower()
            if "appointments_active_slot_idx" in message or "appointments.doctor_id" in message:
                self.send_json(
                    HTTPStatus.CONFLICT,
                    {"error": "That appointment time is no longer available."},
                )
            elif "users.email" in message:
                self.send_json(
                    HTTPStatus.CONFLICT,
                    {"error": "An account with that email already exists."},
                )
            else:
                self.log_error("Database integrity error", error)
                self.send_json(HTTPStatus.CONFLICT, {"error": "That change conflicts with existing records."})
        except Exception as error:
            self.log_error("Request failed", error)
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "The request could not be completed. Please try again."},
            )

    def log_error(self, message, error):
        print(f"{message}: {error}", flush=True)
        traceback.print_exc()

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise APIError(HTTPStatus.BAD_REQUEST, "Invalid request body.") from error
        if length > 16_384:
            raise APIError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Request body is too large.")
        try:
            value = json.loads(self.rfile.read(length) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise APIError(HTTPStatus.BAD_REQUEST, "Request body must be valid JSON.") from error
        if not isinstance(value, dict):
            raise APIError(HTTPStatus.BAD_REQUEST, "Request body must be a JSON object.")
        return value

    def send_json(self, status, value, headers=None):
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        if headers:
            for name, value in headers:
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def require_user(self, role=None):
        cookie = self.headers.get("Cookie", "")
        token = next(
            (
                part.split("=", 1)[1]
                for part in cookie.split(";")
                if part.strip().startswith("session=")
            ),
            "",
        )
        if not token:
            raise APIError(HTTPStatus.UNAUTHORIZED, "Please sign in to continue.")
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        with connect_db() as db:
            user = db.execute(
                """SELECT users.* FROM sessions
                   JOIN users ON users.id = sessions.user_id
                   WHERE sessions.token_hash = ? AND sessions.expires_at > ?""",
                (token_hash, datetime.now().isoformat(timespec="seconds")),
            ).fetchone()
        if not user:
            raise APIError(HTTPStatus.UNAUTHORIZED, "Your session has expired. Please sign in again.")
        if role and user["role"] != role:
            raise APIError(HTTPStatus.FORBIDDEN, "You do not have permission to perform this action.")
        return user

    def create_session(self, user_id):
        token = secrets.token_urlsafe(32)
        expires = datetime.now() + timedelta(days=SESSION_DAYS)
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        with connect_db() as db:
            db.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (token_hash, user_id, expires.isoformat(timespec="seconds")),
            )
        return [
            (
                "Set-Cookie",
                f"session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_DAYS * 86400}",
            )
        ]

    def handle_api(self, path):
        if path == "/api/session" and self.command == "GET":
            user = self.require_user()
            self.send_json(HTTPStatus.OK, {"user": public_user(user)})
            return
        if path == "/api/register" and self.command == "POST":
            data = self.read_json()
            name = require_text(data, "full_name", "Full name", 100)
            email = require_text(data, "email", "Email", 254).lower()
            phone = str(data.get("phone", "")).strip()[:40]
            password = data.get("password", "")
            if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
                raise APIError(HTTPStatus.BAD_REQUEST, "Enter a valid email address.")
            if not isinstance(password, str) or len(password) < 8:
                raise APIError(HTTPStatus.BAD_REQUEST, "Password must be at least 8 characters.")
            with connect_db() as db:
                if db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
                    raise APIError(HTTPStatus.CONFLICT, "An account with that email already exists.")
                cursor = db.execute(
                    """INSERT INTO users (full_name, email, phone, password_hash, role)
                       VALUES (?, ?, ?, ?, 'patient')""",
                    (name, email, phone, hash_password(password)),
                )
                user = db.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
            self.send_json(
                HTTPStatus.CREATED,
                {"user": public_user(user)},
                self.create_session(user["id"]),
            )
            return
        if path == "/api/login" and self.command == "POST":
            data = self.read_json()
            email = require_text(data, "email", "Email", 254).lower()
            password = data.get("password", "")
            if not isinstance(password, str):
                password = ""
            with connect_db() as db:
                user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            if not user or not verify_password(password, user["password_hash"]):
                raise APIError(HTTPStatus.UNAUTHORIZED, "The email or password is incorrect.")
            self.send_json(
                HTTPStatus.OK,
                {"user": public_user(user)},
                self.create_session(user["id"]),
            )
            return
        if path == "/api/logout" and self.command == "POST":
            token = next(
                (
                    part.split("=", 1)[1]
                    for part in self.headers.get("Cookie", "").split(";")
                    if part.strip().startswith("session=")
                ),
                "",
            )
            if token:
                token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
                with connect_db() as db:
                    db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
            self.send_json(
                HTTPStatus.OK,
                {"ok": True},
                [("Set-Cookie", "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0")],
            )
            return
        if path == "/api/doctors" and self.command == "GET":
            with connect_db() as db:
                doctors = db.execute(
                    """SELECT users.id, users.full_name, users.phone, doctors.specialty,
                              doctors.availability
                       FROM doctors JOIN users ON users.id = doctors.user_id
                       ORDER BY users.full_name"""
                ).fetchall()
            self.send_json(
                HTTPStatus.OK,
                {
                    "doctors": [
                        {
                            "id": doctor["id"],
                            "full_name": doctor["full_name"],
                            "phone": doctor["phone"],
                            "specialty": doctor["specialty"],
                            "availability": json.loads(doctor["availability"]),
                        }
                        for doctor in doctors
                    ]
                },
            )
            return
        if path == "/api/appointments" and self.command == "GET":
            self.list_appointments()
            return
        if path == "/api/appointments" and self.command == "POST":
            self.book_appointment()
            return
        if path.startswith("/api/appointments/") and self.command == "PATCH":
            self.update_appointment(path)
            return
        if path == "/api/availability" and self.command == "PUT":
            self.update_availability()
            return
        if path == "/api/admin/users" and self.command == "GET":
            self.list_users()
            return
        if path == "/api/admin/doctors" and self.command == "POST":
            self.create_doctor()
            return
        raise APIError(HTTPStatus.NOT_FOUND, "The requested API endpoint was not found.")

    def list_appointments(self):
        user = self.require_user()
        query = """
            SELECT appointments.*, patients.full_name AS patient_name,
                   patients.email AS patient_email, doctors.full_name AS doctor_name,
                   doctor_profiles.specialty AS doctor_specialty
            FROM appointments
            JOIN users AS patients ON patients.id = appointments.patient_id
            JOIN users AS doctors ON doctors.id = appointments.doctor_id
            JOIN doctors AS doctor_profiles ON doctor_profiles.user_id = doctors.id
        """
        parameters = ()
        if user["role"] == "patient":
            query += " WHERE appointments.patient_id = ?"
            parameters = (user["id"],)
        elif user["role"] == "doctor":
            query += " WHERE appointments.doctor_id = ?"
            parameters = (user["id"],)
        query += " ORDER BY appointments.appointment_date, appointments.appointment_time"
        with connect_db() as db:
            appointments = db.execute(query, parameters).fetchall()
        self.send_json(
            HTTPStatus.OK,
            {
                "appointments": [
                    {
                        "id": item["id"],
                        "patient_id": item["patient_id"],
                        "doctor_id": item["doctor_id"],
                        "patient_name": item["patient_name"],
                        "patient_email": item["patient_email"],
                        "doctor_name": item["doctor_name"],
                        "doctor_specialty": item["doctor_specialty"],
                        "appointment_date": item["appointment_date"],
                        "appointment_time": item["appointment_time"],
                        "reason": item["reason"],
                        "status": item["status"],
                        "created_at": item["created_at"],
                    }
                    for item in appointments
                ]
            },
        )

    def book_appointment(self):
        user = self.require_user("patient")
        data = self.read_json()
        doctor_id = data.get("doctor_id")
        if not isinstance(doctor_id, int) or isinstance(doctor_id, bool):
            raise APIError(HTTPStatus.BAD_REQUEST, "Choose a doctor.")
        appointment_date = require_text(data, "appointment_date", "Appointment date", 10)
        appointment_time = require_text(data, "appointment_time", "Appointment time", 5)
        reason = require_text(data, "reason", "Reason for visit", 500)
        try:
            selected = datetime.strptime(
                f"{appointment_date} {appointment_time}", "%Y-%m-%d %H:%M"
            )
        except ValueError as error:
            raise APIError(HTTPStatus.BAD_REQUEST, "Choose a valid appointment date and time.") from error
        if selected <= datetime.now():
            raise APIError(HTTPStatus.BAD_REQUEST, "Appointment must be scheduled in the future.")
        weekday = WEEKDAYS[(selected.weekday() + 1) % 7]
        with connect_db() as db:
            doctor = db.execute(
                "SELECT availability FROM doctors WHERE user_id = ?", (doctor_id,)
            ).fetchone()
            if not doctor:
                raise APIError(HTTPStatus.NOT_FOUND, "The selected doctor was not found.")
            availability = json.loads(doctor["availability"])
            if weekday not in availability["days"]:
                raise APIError(
                    HTTPStatus.BAD_REQUEST,
                    f"The doctor is not available on {weekday}. Choose a working day.",
                )
            if not availability["start"] <= appointment_time < availability["end"]:
                raise APIError(
                    HTTPStatus.BAD_REQUEST,
                    f"That time is outside the doctor's availability "
                    f"({availability['start']} to before {availability['end']}).",
                )
            cursor = db.execute(
                """INSERT INTO appointments
                   (patient_id, doctor_id, appointment_date, appointment_time, reason)
                   VALUES (?, ?, ?, ?, ?)""",
                (user["id"], doctor_id, appointment_date, appointment_time, reason),
            )
        self.send_json(HTTPStatus.CREATED, {"id": cursor.lastrowid, "status": "pending"})

    def update_appointment(self, path):
        user = self.require_user()
        match = re.fullmatch(r"/api/appointments/(\d+)", path)
        if not match:
            raise APIError(HTTPStatus.NOT_FOUND, "The requested appointment was not found.")
        appointment_id = int(match.group(1))
        data = self.read_json()
        status = data.get("status")
        allowed_statuses = {"pending", "confirmed", "completed", "cancelled"}
        if status not in allowed_statuses:
            raise APIError(HTTPStatus.BAD_REQUEST, "Choose a valid appointment status.")
        with connect_db() as db:
            appointment = db.execute(
                "SELECT * FROM appointments WHERE id = ?", (appointment_id,)
            ).fetchone()
            if not appointment:
                raise APIError(HTTPStatus.NOT_FOUND, "The requested appointment was not found.")
            if user["role"] == "doctor":
                if appointment["doctor_id"] != user["id"]:
                    raise APIError(HTTPStatus.FORBIDDEN, "This appointment belongs to another doctor.")
                valid_transitions = {
                    "pending": {"confirmed", "cancelled"},
                    "confirmed": {"completed", "cancelled"},
                }
                if status not in valid_transitions.get(appointment["status"], set()):
                    raise APIError(HTTPStatus.BAD_REQUEST, "That appointment status change is not allowed.")
            elif user["role"] == "patient":
                if appointment["patient_id"] != user["id"]:
                    raise APIError(HTTPStatus.FORBIDDEN, "This appointment belongs to another patient.")
                if status != "cancelled" or appointment["status"] not in {"pending", "confirmed"}:
                    raise APIError(HTTPStatus.BAD_REQUEST, "Patients can cancel pending or confirmed appointments.")
            db.execute(
                "UPDATE appointments SET status = ? WHERE id = ?",
                (status, appointment_id),
            )
        self.send_json(HTTPStatus.OK, {"id": appointment_id, "status": status})

    def update_availability(self):
        user = self.require_user("doctor")
        data = self.read_json()
        days = data.get("days")
        if not isinstance(days, list) or not days or any(day not in WEEKDAYS for day in days):
            raise APIError(HTTPStatus.BAD_REQUEST, "Select at least one valid working day.")
        start = data.get("start")
        end = data.get("end")
        try:
            datetime.strptime(start, "%H:%M")
            datetime.strptime(end, "%H:%M")
        except (TypeError, ValueError) as error:
            raise APIError(HTTPStatus.BAD_REQUEST, "Enter valid working hours.") from error
        if start >= end:
            raise APIError(HTTPStatus.BAD_REQUEST, "Closing time must be after opening time.")
        availability = json.dumps({"days": list(dict.fromkeys(days)), "start": start, "end": end})
        with connect_db() as db:
            db.execute(
                "UPDATE doctors SET availability = ? WHERE user_id = ?",
                (availability, user["id"]),
            )
        self.send_json(HTTPStatus.OK, {"availability": json.loads(availability)})

    def list_users(self):
        self.require_user("admin")
        with connect_db() as db:
            users = db.execute(
                """SELECT users.id, users.full_name, users.email, users.phone, users.role,
                          doctors.specialty
                   FROM users LEFT JOIN doctors ON doctors.user_id = users.id
                   ORDER BY users.created_at DESC, users.id DESC"""
            ).fetchall()
        self.send_json(
            HTTPStatus.OK,
            {"users": [dict(user) for user in users]},
        )

    def create_doctor(self):
        self.require_user("admin")
        data = self.read_json()
        name = require_text(data, "full_name", "Full name", 100)
        email = require_text(data, "email", "Email", 254).lower()
        specialty = require_text(data, "specialty", "Specialty", 100)
        password = data.get("password", "")
        phone = str(data.get("phone", "")).strip()[:40]
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            raise APIError(HTTPStatus.BAD_REQUEST, "Enter a valid email address.")
        if not isinstance(password, str) or len(password) < 8:
            raise APIError(HTTPStatus.BAD_REQUEST, "Password must be at least 8 characters.")
        availability = json.dumps(
            {"days": WEEKDAYS[1:6], "start": "09:00", "end": "17:00"}
        )
        with connect_db() as db:
            cursor = db.execute(
                """INSERT INTO users (full_name, email, phone, password_hash, role)
                   VALUES (?, ?, ?, ?, 'doctor')""",
                (name, email, phone, hash_password(password)),
            )
            db.execute(
                "INSERT INTO doctors (user_id, specialty, availability) VALUES (?, ?, ?)",
                (cursor.lastrowid, specialty, availability),
            )
        self.send_json(HTTPStatus.CREATED, {"id": cursor.lastrowid})

    def handle_static(self, path):
        if self.command != "GET":
            raise APIError(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed.")
        requested = unquote(path.lstrip("/"))
        if not requested:
            requested = "index.html"
        file_path = (STATIC_DIR / requested).resolve()
        try:
            file_path.relative_to(STATIC_DIR.resolve())
        except ValueError as error:
            raise APIError(HTTPStatus.NOT_FOUND, "File not found.") from error
        if not file_path.is_file():
            raise APIError(HTTPStatus.NOT_FOUND, "File not found.")
        content_types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
        }
        content = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header(
            "Content-Type", content_types.get(file_path.suffix, "application/octet-stream")
        )
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format_string, *args):
        print(f"{self.address_string()} - {format_string % args}", flush=True)


def run_server():
    initialize_database()
    host = os.environ.get("DOCTOR_APP_HOST", "127.0.0.1")
    port = int(os.environ.get("DOCTOR_APP_PORT", "8000"))
    server = ThreadingHTTPServer((host, port), DoctorAppointmentHandler)
    print(f"CarePoint is running at http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping CarePoint.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    run_server()
