"""
Objective 3 — Skill Gap Analysis
Extracted from ThirdObjective.ipynb (logic unchanged).
"""

import re
import difflib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from pathlib import Path


def normalize_title(title):
    if not isinstance(title, str):
        return ""
    t = title.lower().strip()
    t = re.sub(r',?\s*all other$', '', t)
    t = re.sub(r',?\s*occupations,?\s*all other$', '', t)
    t = re.sub(r'\s*\(.*?\)', '', t)
    t = re.sub(r'[^a-z0-9\s]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def find_best_job_match(selected_title, skills_df, occ_df):
    norm_sel = normalize_title(selected_title)

    skills_df = skills_df.copy()
    skills_df['norm_title'] = skills_df['Job_title'].apply(normalize_title)

    # 1. Exact match
    exact = skills_df[skills_df['norm_title'] == norm_sel]
    if not exact.empty:
        return exact.iloc[0]['Job_title'], 100.0

    # 2. Contains match
    contains = skills_df[skills_df['norm_title'].str.contains(norm_sel, na=False)]
    if not contains.empty:
        return contains.iloc[0]['Job_title'], 100.0

    # 3. Hybrid semantic search
    vectorizer = TfidfVectorizer(
        stop_words='english',
        ngram_range=(1, 4),
        min_df=1,
        max_df=0.85,
        sublinear_tf=True
    )

    all_texts = pd.concat([pd.Series([norm_sel]), skills_df['norm_title']], ignore_index=True)
    tfidf_matrix = vectorizer.fit_transform(all_texts)
    cosine_scores = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:]).flatten()

    def hybrid_score(idx):
        cand_norm = skills_df.iloc[idx]['norm_title']
        cos_score = cosine_scores[idx]
        seq_score = difflib.SequenceMatcher(None, norm_sel, cand_norm).ratio()
        bonus = 0.0
        important_terms = {'teacher', 'professor', 'manager', 'science', 'biological',
                        'mathematical', 'environmental', 'research', 'faculty'}
        for term in important_terms:
            if term in norm_sel and term in cand_norm:
                bonus += 0.18
        selection_score = 0.5 * cos_score + 0.35 * seq_score + 0.15 * bonus
        return selection_score, cos_score, seq_score

    top_n = 200
    top_indices = cosine_scores.argsort()[-top_n:][::-1]

    best_score = -1
    best_title = None
    best_cos = 0.0
    best_seq = 0.0

    for idx in top_indices:
        score, cos_score, seq_score = hybrid_score(idx)
        title = skills_df.iloc[idx]['Job_title']
        if score > best_score:
            best_score = score
            best_title = title
            best_cos = cos_score
            best_seq = seq_score

    confidence_score = 0.6 * best_cos + 0.4 * best_seq
    confidence_pct = round(min(confidence_score * 100, 100.0), 1)

    return best_title, confidence_pct


def run_objective3(hybrid_csv, skills_csv, occ_csv, selected_title: str, user_skills_raw: str):
    """
    Main entry point called by Flask.
    selected_title: the career the user picked
    user_skills_raw: comma-separated string of skills
    Returns dict with have/gap skills.
    """
    hybrid_df = pd.read_csv(hybrid_csv)
    skills_df = pd.read_csv(skills_csv, encoding="cp1252", engine="python")
    occ_df = pd.read_csv(occ_csv) if Path(occ_csv).exists() else pd.DataFrame()

    matched, skill_match_confidence = find_best_job_match(selected_title, skills_df, occ_df)

    if matched is None:
        return {"error": "Could not match career to skills database"}

    matches = skills_df[skills_df['Job_title'] == matched]
    if matches.empty:
        return {"error": f"No skills found for matched job: {matched}"}

    job_row = matches.iloc[0]
    req_skills = [s.strip() for s in str(job_row['Skills']).split(',') if s.strip()]

    user_skills = [s.strip().lower() for s in user_skills_raw.split(',') if s.strip()]

    have, gap = [], []
    for skill in req_skills:
        sl = skill.lower()
        if any(
            sl in u or u in sl or difflib.SequenceMatcher(None, sl, u).ratio() > 0.72
            for u in user_skills
        ):
            have.append(skill)
        else:
            gap.append(skill)

    # Save CSV
    pd.DataFrame([{
        'Selected_Career': selected_title,
        'Matched_Job': matched,
        'Total_Required': len(req_skills),
        'User_Skills_Count': len(user_skills),
        'Have_Skills': " | ".join(have),
        'Gap_Skills': " | ".join(gap),
        'Skill_Match_Confidence': skill_match_confidence
    }]).to_csv("skill_gap_analysis.csv", index=False)

    return {
        "selected_career": selected_title,
        "matched_job": matched,
        "total_required": len(req_skills),
        "user_skills_count": len(user_skills),
        "have": have,
        "gap": gap,
        "coverage_pct": round(len(have) / len(req_skills) * 100, 1) if req_skills else 0,
        "skill_match_confidence": skill_match_confidence,
    }