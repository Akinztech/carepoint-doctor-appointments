import http.cookiejar
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import date, timedelta
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import server


class ApplicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.db_path = Path(cls.temp_dir.name) / "test.sqlite3"
        cls.db_path_patch = patch.object(server, "DB_PATH", cls.db_path)
        cls.db_path_patch.start()
        server.initialize_database()
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.DoctorAppointmentHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.httpd.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=3)
        cls.db_path_patch.stop()
        cls.temp_dir.cleanup()

    def setUp(self):
        self.cookies = http.cookiejar.CookieJar()
        self.client = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookies)
        )

    def request(self, method, path, payload=None):
        body = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(
            self.base_url + path,
            data=body,
            method=method,
            headers={"Content-Type": "application/json"} if body else {},
        )
        try:
            response = self.client.open(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        return response.code, json.loads(response.read())

    def login(self, email, password):
        return self.request("POST", "/api/login", {"email": email, "password": password})

    def test_seeded_doctor_and_availability_are_public(self):
        status, body = self.request("GET", "/api/doctors")
        self.assertEqual(status, 200)
        self.assertEqual(body["doctors"][0]["specialty"], "Cardiology")
        self.assertIn("Mon", body["doctors"][0]["availability"]["days"])

    def test_registration_creates_patient_and_session(self):
        status, body = self.request(
            "POST",
            "/api/register",
            {
                "full_name": "New Patient",
                "email": "new.patient@example.test",
                "phone": "555-0123",
                "password": "SecurePass123",
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(body["user"]["role"], "patient")
        self.assertEqual(self.request("GET", "/api/session")[1]["user"]["email"], "new.patient@example.test")

    def test_patient_can_request_a_future_appointment(self):
        self.login("patient@carepoint.test", "Patient123!")
        future = date.today() + timedelta(days=20)
        while future.weekday() >= 5:
            future += timedelta(days=1)
        status, body = self.request(
            "POST",
            "/api/appointments",
            {
                "doctor_id": 2,
                "appointment_date": future.isoformat(),
                "appointment_time": "11:00",
                "reason": "A test visit for an ongoing health concern.",
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(body["status"], "pending")
        appointments = self.request("GET", "/api/appointments")[1]["appointments"]
        self.assertTrue(any(item["id"] == body["id"] for item in appointments))

    def test_patient_cannot_use_admin_endpoints(self):
        self.login("patient@carepoint.test", "Patient123!")
        status, body = self.request("GET", "/api/admin/users")
        self.assertEqual(status, 403)
        self.assertIn("permission", body["error"])

    def test_doctor_can_confirm_a_patient_request(self):
        self.login("patient@carepoint.test", "Patient123!")
        future = date.today() + timedelta(days=30)
        while future.weekday() >= 5:
            future += timedelta(days=1)
        _, appointment = self.request(
            "POST",
            "/api/appointments",
            {
                "doctor_id": 2,
                "appointment_date": future.isoformat(),
                "appointment_time": "13:00",
                "reason": "Review of a recent checkup.",
            },
        )
        self.cookies.clear()
        self.login("doctor@carepoint.test", "Doctor123!")
        status, body = self.request(
            "PATCH",
            f"/api/appointments/{appointment['id']}",
            {"status": "confirmed"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "confirmed")

    def test_booking_outside_availability_is_rejected(self):
        self.login("patient@carepoint.test", "Patient123!")
        future = date.today() + timedelta(days=20)
        while future.weekday() >= 5:
            future += timedelta(days=1)
        status, body = self.request(
            "POST",
            "/api/appointments",
            {
                "doctor_id": 2,
                "appointment_date": future.isoformat(),
                "appointment_time": "18:30",
                "reason": "A visit outside the doctor's office hours.",
            },
        )
        self.assertEqual(status, 400)
        self.assertIn("availability", body["error"])

    def test_booking_at_opening_time_is_allowed_and_closing_time_is_not(self):
        self.login("patient@carepoint.test", "Patient123!")
        future = date.today() + timedelta(days=20)
        while future.weekday() >= 5:
            future += timedelta(days=1)
        booking = {
            "doctor_id": 2,
            "appointment_date": future.isoformat(),
            "appointment_time": "09:00",
            "reason": "A visit at the opening-time boundary.",
        }
        status, _ = self.request("POST", "/api/appointments", booking)
        self.assertEqual(status, 201)
        booking["appointment_time"] = "17:00"
        status, body = self.request("POST", "/api/appointments", booking)
        self.assertEqual(status, 400)
        self.assertIn("09:00", body["error"])
        self.assertIn("17:00", body["error"])

    def test_booking_on_non_working_day_has_day_specific_error(self):
        self.login("patient@carepoint.test", "Patient123!")
        future = date.today() + timedelta(days=20)
        while future.weekday() != 5:
            future += timedelta(days=1)
        status, body = self.request(
            "POST",
            "/api/appointments",
            {
                "doctor_id": 2,
                "appointment_date": future.isoformat(),
                "appointment_time": "11:00",
                "reason": "A visit on a non-working day.",
            },
        )
        self.assertEqual(status, 400)
        self.assertIn("not available on Sat", body["error"])

    def test_active_appointment_slot_cannot_be_double_booked(self):
        self.login("patient@carepoint.test", "Patient123!")
        future = date.today() + timedelta(days=25)
        while future.weekday() >= 5:
            future += timedelta(days=1)
        booking = {
            "doctor_id": 2,
            "appointment_date": future.isoformat(),
            "appointment_time": "14:00",
            "reason": "A test visit for an active appointment slot.",
        }
        status, _ = self.request("POST", "/api/appointments", booking)
        self.assertEqual(status, 201)
        status, body = self.request("POST", "/api/appointments", booking)
        self.assertEqual(status, 409)
        self.assertIn("no longer available", body["error"])

    def test_cancelled_appointment_releases_its_time_slot(self):
        self.login("patient@carepoint.test", "Patient123!")
        future = date.today() + timedelta(days=35)
        while future.weekday() >= 5:
            future += timedelta(days=1)
        booking = {
            "doctor_id": 2,
            "appointment_date": future.isoformat(),
            "appointment_time": "15:00",
            "reason": "A test visit that will be cancelled and rescheduled.",
        }
        _, appointment = self.request("POST", "/api/appointments", booking)
        status, _ = self.request(
            "PATCH",
            f"/api/appointments/{appointment['id']}",
            {"status": "cancelled"},
        )
        self.assertEqual(status, 200)
        status, _ = self.request("POST", "/api/appointments", booking)
        self.assertEqual(status, 201)

    def test_invalid_login_does_not_create_a_session(self):
        status, body = self.login("patient@carepoint.test", "incorrect-password")
        self.assertEqual(status, 401)
        self.assertIn("incorrect", body["error"])

    def test_admin_can_create_doctor_profile(self):
        self.login("admin@carepoint.test", "Admin123!")
        status, body = self.request(
            "POST",
            "/api/admin/doctors",
            {
                "full_name": "Dr. Taylor Reed",
                "email": "taylor.reed@example.test",
                "specialty": "Family medicine",
                "phone": "555-0199",
                "password": "Temporary123!",
            },
        )
        self.assertEqual(status, 201)
        doctors = self.request("GET", "/api/doctors")[1]["doctors"]
        self.assertTrue(any(doctor["id"] == body["id"] for doctor in doctors))


if __name__ == "__main__":
    unittest.main()
