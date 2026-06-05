"""
Objective 1 — RIASEC Career Recommender
Extracted from FinalFirstObjective.ipynb (logic unchanged).
"""

import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity, pairwise_distances
from sklearn.preprocessing import normalize


RIASEC_QUESTIONS = {
    "Realistic": [
        "I enjoy using hand tools, power tools, or machines to complete a task.",
        "I prefer jobs that let me work outdoors or in non-office settings.",
        "I feel energized when repairing, assembling, or building physical objects.",
        "I like tasks that require manual dexterity or mechanical skill.",
        "I enjoy troubleshooting equipment or fixing broken items.",
    ],
    "Investigative": [
        "I enjoy designing experiments or tests to answer a question.",
        "I like analyzing data, charts, or statistics to draw conclusions.",
        "I prefer tasks that require careful observation and critical thinking.",
        "I enjoy reading technical articles or scientific papers to learn new ideas.",
        "I am curious about how systems, machines, or organisms function.",
    ],
    "Artistic": [
        "I enjoy creating original designs, artworks, or compositions.",
        "I prefer open-ended tasks where I can choose style, form, or approach.",
        "I like experimenting with new materials, mediums, or artistic techniques.",
        "I feel motivated when I produce work that expresses personal meaning.",
        "I enjoy writing, composing, or producing creative content for others.",
    ],
    "Social": [
        "I enjoy teaching or explaining concepts so others can learn them.",
        "I prefer work that focuses on supporting people's personal growth or wellbeing.",
        "I feel rewarded when I help resolve interpersonal conflicts or coach others.",
        "I like facilitating group activities, workshops, or meetings.",
        "I enjoy volunteering or contributing to community-oriented causes.",
    ],
    "Enterprising": [
        "I enjoy persuading others to accept an idea or buy a product/service.",
        "I prefer taking the lead on projects and motivating teams toward goals.",
        "I like creating plans to grow or scale a project, product, or business.",
        "I feel comfortable taking calculated risks to pursue new opportunities.",
        "I enjoy negotiating agreements, contracts, or partnerships.",
    ],
    "Conventional": [
        "I enjoy creating and maintaining organized records, spreadsheets, or databases.",
        "I prefer tasks with clear rules, templates, and step-by-step procedures.",
        "I like verifying data accuracy and ensuring compliance with standards.",
        "I feel comfortable working within established systems and routines.",
        "I enjoy filing, categorizing, or organizing information systematically.",
    ],
}

RIASEC_ORDER = ['Realistic', 'Investigative', 'Artistic', 'Social', 'Enterprising', 'Conventional']


def get_questions():
    """Return all questions structured for the frontend."""
    questions = []
    for category in RIASEC_ORDER:
        for q in RIASEC_QUESTIONS[category]:
            questions.append({"category": category, "text": q})
    return questions


def standardize_column_names(df):
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    return df


def load_datasets(occ_path, interests_path):
    occ = pd.read_csv(occ_path)
    intr = pd.read_csv(interests_path)
    occ = standardize_column_names(occ)
    intr = standardize_column_names(intr)
    return occ, intr


def prepare_riasec_matrix(occupation_data, interests_data, riasec_cols):
    required_intr = ['O*NET-SOC Code', 'Element Name', 'Data Value']
    for c in required_intr:
        if c not in interests_data.columns:
            raise ValueError(f"Missing column in Interests.csv: {c}")

    interests_filtered = interests_data[
        interests_data['Element Name'].isin(riasec_cols)
    ].copy()

    interests_wide = interests_filtered.pivot_table(
        index='O*NET-SOC Code',
        columns='Element Name',
        values='Data Value',
        aggfunc='mean'
    ).reset_index()

    interests_wide.columns.name = None
    interests_wide.columns = [str(c).strip() for c in interests_wide.columns]

    for c in riasec_cols:
        if c not in interests_wide.columns:
            interests_wide[c] = 0

    merged = pd.merge(occupation_data, interests_wide, on='O*NET-SOC Code', how='inner')

    for c in riasec_cols:
        merged[c] = pd.to_numeric(merged[c], errors='coerce').fillna(0)

    return merged.reset_index(drop=True)


def compute_user_vector(answers: dict) -> np.ndarray:
    """
    answers: {category: [score1..score5]}
    Returns normalized user vector.
    """
    riasec_scores = {}
    for cat in RIASEC_ORDER:
        vals = answers.get(cat, [3, 3, 3, 3, 3])
        riasec_scores[cat] = np.mean(vals)

    user_vector = np.array([riasec_scores[c] for c in RIASEC_ORDER], dtype=float)
    user_vector_1_7 = user_vector * 1.4
    user_vector_norm = normalize([user_vector_1_7])[0]

    profile = {c: float(user_vector_1_7[i]) for i, c in enumerate(RIASEC_ORDER)}
    return user_vector_norm, profile


def recommend_careers(data, riasec_cols, user_vector, top_n=5):
    occupation_vectors = data[riasec_cols].values.astype(float)
    occ_norm = normalize(occupation_vectors)
    user_norm = normalize([user_vector])
    cosine_scores = cosine_similarity(user_norm, occ_norm)[0]
    distances = pairwise_distances([user_vector], occupation_vectors)[0]
    distance_scores = 1 / (1 + distances)
    final_score = (0.7 * cosine_scores) + (0.3 * distance_scores)

    results = data.copy()
    results["Similarity_Score"] = final_score
    results = results.sort_values("Similarity_Score", ascending=False).reset_index(drop=True)
    return results.head(top_n)


def run_objective1(occ_path, interests_path, answers: dict):
    """
    Main entry point called by Flask.
    answers: {category: [score1..score5]}
    Returns list of top career dicts + RIASEC profile dict.
    """
    riasec_cols = RIASEC_ORDER
    occ_df, intr_df = load_datasets(occ_path, interests_path)
    final_df = prepare_riasec_matrix(occ_df, intr_df, riasec_cols)

    user_vector, profile = compute_user_vector(answers)
    top_recs = recommend_careers(final_df, riasec_cols, user_vector, top_n=5)

    careers = []
    for _, row in top_recs.iterrows():
        desc = str(row.get("Description", "")) if pd.notna(row.get("Description", "")) else ""
        careers.append({
            "onet_code": str(row["O*NET-SOC Code"]),
            "title": str(row["Title"]),
            "similarity_score": float(row["Similarity_Score"]),
            "riasec": {
                "R": float(row["Realistic"]),
                "I": float(row["Investigative"]),
                "A": float(row["Artistic"]),
                "S": float(row["Social"]),
                "E": float(row["Enterprising"]),
                "C": float(row["Conventional"]),
            },
            "description": desc[:400] + "..." if len(desc) > 400 else desc,
        })

    # Save CSV for Objective 2
    top_recs.to_csv("my_career_recommendations.csv", index=False)

    return {"careers": careers, "profile": profile}
