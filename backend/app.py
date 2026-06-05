"""
CareerCompass Flask Backend
Run: python app.py
Then open http://localhost:5000 in your browser.
"""

import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from objective1 import get_questions, run_objective1
from objective2 import run_objective2
from objective3 import run_objective3

app = Flask(__name__, static_folder="static")
CORS(app)

# ─── CONFIG: update these paths to your actual dataset locations ───
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Dataset paths — edit these if your folder structure differs
OCC_PATH       = os.path.join(BASE_DIR, "../DataSets/Occupation Data.csv")
INTERESTS_PATH = os.path.join(BASE_DIR, "../DataSets/Interests.csv")
SKILLS_CSV     = os.path.join(BASE_DIR, "../AdditionalDS/skills-merged.csv")

# Intermediate CSVs (written here, in same dir as app.py)
OBJ1_CSV   = os.path.join(BASE_DIR, "../code/my_career_recommendations.csv")
HYBRID_CSV = os.path.join(BASE_DIR, "../code/top_10_hybrid_recommendations.csv")
OCC_CSV    = OCC_PATH  # used by obj3 for fallback


# ─────────────────────────────────────────────
# Serve frontend
# ─────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ─────────────────────────────────────────────
# API: Objective 1
# ─────────────────────────────────────────────

@app.route("/api/questions", methods=["GET"])
def api_questions():
    """Return the RIASEC questionnaire."""
    return jsonify({"questions": get_questions()})


@app.route("/api/objective1", methods=["POST"])
def api_objective1():
    """
    Expects JSON: { "answers": { "Realistic": [1,3,5,2,4], ... } }
    Returns top 5 RIASEC-matched careers + user profile.
    """
    data = request.get_json()
    answers = data.get("answers", {})

    try:
        result = run_objective1(OCC_PATH, INTERESTS_PATH, answers)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# API: Objective 2
# ─────────────────────────────────────────────

@app.route("/api/objective2", methods=["POST"])
def api_objective2():
    """
    Expects JSON: { "user_text": "I love working with..." }
    Returns top 10 hybrid careers.
    """
    data = request.get_json()
    user_text = data.get("user_text", "")

    if not user_text.strip():
        return jsonify({"error": "Please describe your interests."}), 400

    try:
        result = run_objective2(OCC_PATH, INTERESTS_PATH, OBJ1_CSV, user_text)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# API: Objective 3
# ─────────────────────────────────────────────

@app.route("/api/objective3", methods=["POST"])
def api_objective3():
    """
    Expects JSON: { "selected_title": "...", "user_skills": "python, excel, ..." }
    Returns skill gap analysis.
    """
    data = request.get_json()
    selected_title = data.get("selected_title", "")
    user_skills = data.get("user_skills", "")

    if not selected_title:
        return jsonify({"error": "No career selected."}), 400

    try:
        result = run_objective3(HYBRID_CSV, SKILLS_CSV, OCC_CSV, selected_title, user_skills)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────

if __name__ == "__main__":
    print("\n🚀 CareerCompass backend starting...")
    print(f"   OCC data   : {OCC_PATH}")
    print(f"   Interests  : {INTERESTS_PATH}")
    print(f"   Skills DB  : {SKILLS_CSV}")
    print("\n   Open http://localhost:5000 in your browser\n")
    app.run(debug=True, port=5000)
