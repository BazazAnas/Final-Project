"""
Objective 2 — NLP Hybrid Career Recommender
Extracted from FinalSecondObjective.ipynb (logic unchanged).
"""

import os
import pandas as pd
import nltk

from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from nltk.stem import WordNetLemmatizer

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import MinMaxScaler


# Ensure NLTK resources
for r in ["punkt", "punkt_tab", "stopwords", "wordnet"]:
    try:
        nltk.data.find(f"corpora/{r}")
    except LookupError:
        try:
            nltk.data.find(f"tokenizers/{r}")
        except LookupError:
            nltk.download(r, quiet=True)


class CareerCompassObjective2:

    def __init__(self, occ_path, interests_path, obj1_path):
        self.occ_path = occ_path
        self.interests_path = interests_path
        self.obj1_path = obj1_path

        self.stop_words = set(stopwords.words("english"))
        self.lemmatizer = WordNetLemmatizer()

        self.vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 3),
            min_df=2,
            max_df=0.85,
            sublinear_tf=True
        )

        self.full_db = None
        self.obj1_results = None
        self.tfidf_matrix = None

    def preprocess(self, text):
        if not isinstance(text, str):
            return ""
        text = text.lower()
        tokens = word_tokenize(text)
        tokens = [
            self.lemmatizer.lemmatize(t)
            for t in tokens
            if t.isalpha() and t not in self.stop_words
        ]
        return " ".join(tokens)

    def load_datasets(self):
        occ = pd.read_csv(self.occ_path)
        occ.columns = [c.strip() for c in occ.columns]

        intr = pd.read_csv(self.interests_path)
        intr.columns = [c.strip() for c in intr.columns]

        self.full_db = occ.copy()

        if os.path.exists(self.obj1_path):
            self.obj1_results = pd.read_csv(self.obj1_path)

        # Build corpus
        title = self.full_db["Title"].fillna("")
        desc = self.full_db["Description"].fillna("")

        alt_titles = ""
        if "Alternate Titles" in self.full_db.columns:
            alt_titles = self.full_db["Alternate Titles"].fillna("")

        tasks = ""
        if "Tasks" in self.full_db.columns:
            tasks = self.full_db["Tasks"].fillna("")

        corpus = (
            (title + " ") * 6 +
            alt_titles +
            desc +
            tasks
        )

        processed = corpus.apply(self.preprocess)
        self.tfidf_matrix = self.vectorizer.fit_transform(processed)

    def get_recommendations(self, user_text):
        user_processed = self.preprocess(user_text)
        user_vec = self.vectorizer.transform([user_processed])

        text_similarity = cosine_similarity(user_vec, self.tfidf_matrix).flatten()

        results = self.full_db.copy()
        results["Interest_Score"] = text_similarity

        scaler = MinMaxScaler()
        results["Interest_Score"] = scaler.fit_transform(results[["Interest_Score"]])

        if self.obj1_results is not None:
            results = pd.merge(
                results,
                self.obj1_results[["O*NET-SOC Code", "Similarity_Score"]],
                on="O*NET-SOC Code",
                how="left"
            )
            results["Similarity_Score"] = results["Similarity_Score"].fillna(0)
        else:
            results["Similarity_Score"] = 0

        results["Similarity_Score"] = scaler.fit_transform(results[["Similarity_Score"]])

        results["Final_Score"] = (
            0.25 * results["Similarity_Score"] +
            0.75 * results["Interest_Score"]
        )

        results = results.sort_values(by="Final_Score", ascending=False).reset_index(drop=True)

        # Objective 1 display
        obj1_display = None
        if self.obj1_results is not None:
            obj1_display = pd.merge(
                self.obj1_results,
                results[["O*NET-SOC Code", "Interest_Score"]],
                on="O*NET-SOC Code",
                how="left"
            ).sort_values(by="Similarity_Score", ascending=False)

        final_top10 = results.head(10)
        return obj1_display, final_top10


def run_objective2(occ_path, interests_path, obj1_csv_path, user_text: str):
    """
    Main entry point called by Flask.
    Returns obj1_display list + top10 list.
    """
    engine = CareerCompassObjective2(occ_path, interests_path, obj1_csv_path)
    engine.load_datasets()

    obj1_display, final_top10 = engine.get_recommendations(user_text)

    # Save CSV for Objective 3
    final_top10.to_csv("top_10_hybrid_recommendations.csv", index=False)

    top10_list = []
    for _, row in final_top10.iterrows():
        desc = str(row.get("Description", "")) if pd.notna(row.get("Description", "")) else ""
        top10_list.append({
            "onet_code": str(row["O*NET-SOC Code"]),
            "title": str(row["Title"]),
            "final_score": float(row["Final_Score"]),
            "interest_score": float(row["Interest_Score"]),
            "similarity_score": float(row.get("Similarity_Score", 0)),
            "description": desc[:400] + "..." if len(desc) > 400 else desc,
        })

    obj1_list = []
    if obj1_display is not None:
        for _, row in obj1_display.head(5).iterrows():
            obj1_list.append({
                "title": str(row.get("Title", "")),
                "riasec_score": float(row["Similarity_Score"]),
                "interest_score": float(row.get("Interest_Score", 0)),
            })

    return {"top10": top10_list, "obj1_display": obj1_list}
