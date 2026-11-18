
from flask import (
    Flask, render_template, request, redirect,
    url_for, session, flash, jsonify
)
from werkzeug.security import generate_password_hash, check_password_hash
from config import Config
from functools import wraps
from mysql.connector import Error
import mysql.connector
import re

app = Flask(__name__)
app.config.from_object(Config)

# Session security
app.secret_key = app.config["SECRET_KEY"]


# ============== DATABASE CONNECTION ==============

def get_db_connection():
    return mysql.connector.connect(
        host=app.config["MYSQL_HOST"],
        user=app.config["MYSQL_USER"],
        password=app.config["MYSQL_PASSWORD"],
        database=app.config["MYSQL_DATABASE"],
        connection_timeout=10
    )


# ============== LOGIN REQUIRED ==============

def login_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            flash("Please login first.")
            return redirect(url_for("login"))

        return function(*args, **kwargs)

    return wrapper


# ============== HOME PAGE ==============

@app.route("/")
def index():
    if "user_id" in session:
        return redirect(url_for("dashboard"))

    return render_template("index.html")


# ============== REGISTER ==============

@app.route("/register", methods=["GET", "POST"])
def register():

    if request.method == "POST":

        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        phone = request.form.get("phone", "").strip()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")

        if not all([name, email, phone, password, confirm_password]):
            flash("Please fill all fields.")
            return redirect(url_for("register"))

        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            flash("Please enter a valid email address.")
            return redirect(url_for("register"))

        if password != confirm_password:
            flash("Passwords do not match.")
            return redirect(url_for("register"))

        if len(password) < 8:
            flash("Password must contain at least 8 characters.")
            return redirect(url_for("register"))

        hashed_password = generate_password_hash(password)

        db = None
        cursor = None

        try:
            db = get_db_connection()
            cursor = db.cursor()

            cursor.execute(
                """
                INSERT INTO users
                (name, email, phone, password_hash)
                VALUES (%s, %s, %s, %s)
                """,
                (name, email, phone, hashed_password)
            )

            db.commit()

            flash("Registration successful! Please login.")
            return redirect(url_for("login"))

        except Error as e:
            if db:
                db.rollback()

            print("REGISTER ERROR:", e)
            flash("Registration failed. Email may already exist.")

        finally:
            if cursor:
                cursor.close()
            if db and db.is_connected():
                db.close()

    return render_template("register.html")


# ============== LOGIN ==============

@app.route("/login", methods=["GET", "POST"])
def login():

    if "user_id" in session:
        return redirect(url_for("dashboard"))

    if request.method == "POST":

        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if not email or not password:
            flash("Please enter email and password.")
            return redirect(url_for("login"))

        db = None
        cursor = None

        try:
            db = get_db_connection()
            cursor = db.cursor(dictionary=True)

            cursor.execute(
                "SELECT id, name, email, password_hash FROM users WHERE email = %s",
                (email,)
            )

            user = cursor.fetchone()

            if user and check_password_hash(user["password_hash"], password):

                session.clear()
                session["user_id"] = user["id"]
                session["user_name"] = user["name"]
                session.permanent = True

                print("LOGIN SUCCESS:", user["email"])

                return redirect(url_for("dashboard"))

            flash("Invalid email or password.")

        except Error as e:
            print("LOGIN DATABASE ERROR:", e)
            flash("Database connection failed. Check MySQL settings.")

        finally:
            if cursor:
                cursor.close()
            if db and db.is_connected():
                db.close()

    return render_template("login.html")


# ============== DASHBOARD ==============

@app.route("/dashboard")
@login_required
def dashboard():
    return render_template(
        "dashboard.html",
        user_name=session.get("user_name", "User")
    )


# ============== AI ASSISTANT PAGE ==============

@app.route("/assistant")
@login_required
def assistant():
    return render_template("assistant.html")


# ============== EMERGENCY PAGE ==============

@app.route("/emergency")
@login_required
def emergency():
    return render_template("emergency.html")


# ============== AI CHAT API ==============

@app.route("/api/chat", methods=["POST"])
@login_required
def chat():

    data = request.get_json(silent=True) or {}
    message = data.get("message", "")

    if not isinstance(message, str) or not message.strip():
        return jsonify({"error": "Message is required"}), 400

    message = message.strip()

    api_key = app.config.get("OPENAI_API_KEY")

    if not api_key:
        return jsonify({
            "reply": "AI service configure nahi hai. Immediate emergency mein India ke 112 number par call karein."
        })

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)

        response = client.responses.create(
            model="gpt-4.1-mini",
            instructions=(
                "You are HumanSOS AI, an emergency safety assistant. "
                "Give clear and safe guidance. "
                "For immediate danger, advise contacting emergency services. "
                "In India, emergency number is 112. "
                "Never claim that help has been dispatched."
            ),
            input=message
        )

        return jsonify({"reply": response.output_text})

    except Exception as e:
        print("AI ERROR:", e)

        return jsonify({
            "error": "AI service temporarily unavailable.",
            "reply": "AI service unavailable. Immediate emergency mein 112 par call karein."
        }), 503


# ============== SOS EMERGENCY API ==============

@app.route("/api/emergency", methods=["POST"])
@login_required
def create_emergency():

    data = request.get_json(silent=True) or {}

    emergency_type = data.get("emergency_type", "")

    if not isinstance(emergency_type, str) or not emergency_type.strip():
        return jsonify({"error": "Emergency type is required"}), 400

    try:
        latitude = float(data.get("latitude"))
        longitude = float(data.get("longitude"))

        if not (-90 <= latitude <= 90):
            raise ValueError("Invalid latitude")

        if not (-180 <= longitude <= 180):
            raise ValueError("Invalid longitude")

    except (TypeError, ValueError):
        return jsonify({"error": "Invalid GPS coordinates"}), 400

    db = None
    cursor = None

    try:
        db = get_db_connection()
        cursor = db.cursor()

        cursor.execute(
            """
            INSERT INTO emergencies
            (user_id, emergency_type, latitude, longitude)
            VALUES (%s, %s, %s, %s)
            """,
            (
                session["user_id"],
                emergency_type.strip(),
                latitude,
                longitude
            )
        )

        db.commit()

        emergency_id = cursor.lastrowid

        return jsonify({
            "success": True,
            "emergency_id": emergency_id,
            "message": "Emergency request saved in database. No emergency service or contact has been notified."
        })

    except Error as e:
        if db:
            db.rollback()

        print("SOS DATABASE ERROR:", e)

        return jsonify({
            "error": "Unable to save emergency request."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if db and db.is_connected():
            db.close()


# ============== LOGOUT ==============

@app.route("/logout")
def logout():
    session.clear()
    flash("You have been logged out.")
    return redirect(url_for("index"))


# ============== DATABASE TEST ==============

@app.route("/db-test")
def db_test():

    try:
        db = get_db_connection()
        cursor = db.cursor()

        cursor.execute("SELECT 1")
        result = cursor.fetchone()

        cursor.close()
        db.close()

        return jsonify({
            "success": True,
            "database": "Connected successfully"
        })

    except Error as e:
        print("DATABASE TEST ERROR:", e)

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============== RUN APPLICATION ==============

if __name__ == "__main__":
    app.run(debug=True)
