const API = '';

const RIASEC_COLORS = {
  Realistic: '#bd6a35',
  Investigative: '#2f6fa8',
  Artistic: '#8b4b9e',
  Social: '#1f9d6c',
  Enterprising: '#cf4a3d',
  Conventional: '#5b6474',
};

const CAT_ORDER = ['Realistic', 'Investigative', 'Artistic', 'Social', 'Enterprising', 'Conventional'];
const STEPS = ['Welcome', 'RIASEC', 'Top 5', 'Interests', 'Top 10', 'Skill Gap', 'Results'];

const LOADING_MESSAGES = {
  questions: 'Loading the survey instrument…',
  objective1: 'Calibrating your RIASEC profile…',
  objective2: 'Cross-referencing interests against O*NET…',
  skillgap: 'Plotting your skill coverage…',
};

// ─── STATE ───────────────────────────────────────────
const state = {
  step: 0,          // 0=welcome 1=riasec 2=obj1results 3=interests 4=top10 5=skillgap 6=results
  questions: [],
  answers: {},      // { Realistic: [1,3,5,2,4], ... }
  obj1Result: null, // {careers, profile}
  interestText: '',
  obj2Result: null, // {top10, obj1_display}
  selectedCareer: null,
  userSkills: '',
  gapResult: null,
  loading: false,
  loadingKey: 'questions',
  error: null,
};

let currentCatIdx = 0;

// ─── RENDER ENGINE ───────────────────────────────────
function render() {
  document.getElementById('app').innerHTML = buildApp();
  attachEvents();
  if (state.step === 6 && !state.loading) animateGapResults();
}

function animateGapResults() {
  const ring = document.querySelector('.coverage-ring circle[data-fill]');
  if (ring) {
    const dash = ring.dataset.dash, circ = ring.dataset.circ;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ring.setAttribute('stroke-dasharray', `${dash} ${circ}`);
      });
    });
  }
  document.querySelectorAll('.gap-stat-val[data-countup]').forEach(el => {
    const target = parseFloat(el.dataset.countup);
    const suffix = el.dataset.suffix || '';
    const isFloat = !Number.isInteger(target);
    const duration = 900;
    const start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = target * eased;
      el.textContent = (isFloat ? val.toFixed(1) : Math.round(val)) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

function buildApp() {
  return `
    ${buildHeader()}
    <div class="app-shell">
      ${buildStepRail()}
      <main class="screen-wrap">
        <div class="screen">
          ${buildScreen()}
        </div>
      </main>
    </div>
  `;
}

function buildHeader() {
  return `
    <header class="site-header">
      <div class="wordmark">CareerCompass</div>
      <div class="tagline">Discover · Match · Navigate</div>
    </header>
  `;
}

// ─── PATH RAIL (signature element) ───────────────────
function buildStepRail() {
  let html = `<nav class="step-rail" aria-label="Assessment progress"><div class="rail-title">Your Path</div><ol class="step-list">`;
  STEPS.forEach((label, s) => {
    const cls = state.step > s ? 'done' : state.step === s ? 'active' : '';
    const idx = String(s + 1).padStart(2, '0');
    html += `
      <li class="step-node ${cls}">
        <span class="step-index">${idx}</span>
        <span class="step-label">${label}</span>
      </li>
    `;
  });
  html += '</ol></nav>';
  return html;
}

function buildScreen() {
  if (state.loading) return buildLoading();
  if (state.step === 0) return buildWelcome();
  if (state.step === 1) return buildRIASEC();
  if (state.step === 2) return buildObj1Results();
  if (state.step === 3) return buildInterests();
  if (state.step === 4) return buildTop10();
  if (state.step === 5) return buildSkillGap();
  if (state.step === 6) return buildGapResults();
  return '';
}

// ─── LOADING ─────────────────────────────────────────
function buildLoading() {
  const msg = LOADING_MESSAGES[state.loadingKey] || 'Working…';
  return `
    <div class="loading-state">
      <div class="spinner"></div>
      <div class="loading-text">${msg}</div>
    </div>
  `;
}

// ─── WELCOME ─────────────────────────────────────────
function buildWelcome() {
  return `
    <div class="section-eyebrow">Career Discovery System</div>
    <div class="section-title">Find your path with science-backed matching</div>
    <div class="section-subtitle">
      CareerCompass uses three intelligent layers — personality profiling, semantic interest matching,
      and skill gap analysis — to surface careers that genuinely fit you.
    </div>
    <div class="welcome-grid">
      <div class="welcome-card">
        <div class="welcome-card-num">Layer 01</div>
        <div class="welcome-card-title">RIASEC Profile</div>
        <div class="welcome-card-desc">30 questions across 6 personality dimensions map you to O*NET occupations via cosine similarity.</div>
      </div>
      <div class="welcome-card">
        <div class="welcome-card-num">Layer 02</div>
        <div class="welcome-card-title">Interest Matching</div>
        <div class="welcome-card-desc">TF-IDF NLP analysis of your interests fused with RIASEC scores produces a hybrid top-10 ranking.</div>
      </div>
      <div class="welcome-card">
        <div class="welcome-card-num">Layer 03</div>
        <div class="welcome-card-title">Skill Gap Analysis</div>
        <div class="welcome-card-desc">Compare your current skills against the role requirements and get a clear development roadmap.</div>
      </div>
    </div>
    ${state.error ? `<div class="error-banner">${state.error}</div>` : ''}
    <div class="btn-row">
      <button class="btn btn-primary" id="btn-start">Begin Assessment →</button>
    </div>
  `;
}

// ─── RIASEC QUESTIONNAIRE ─────────────────────────────
function buildRIASEC() {
  if (!state.questions.length) return '<div class="loading-state"><div class="spinner"></div></div>';

  const cat = CAT_ORDER[currentCatIdx];
  const catQs = state.questions.filter(q => q.category === cat);
  const catAnswers = state.answers[cat] || [];
  const totalAnswered = Object.values(state.answers).reduce((a, b) => a + b.length, 0);
  const totalQ = 30;
  const pct = Math.round(totalAnswered / totalQ * 100);

  let html = `
    <div class="section-eyebrow">Step 1 of 3 — Personality Assessment</div>
    <div class="section-title">RIASEC Career Interest Survey</div>
    <div class="section-subtitle">Rate each statement 1 (Strongly Disagree) to 5 (Strongly Agree). Be honest — there are no right answers.</div>
    <div class="q-progress"><div class="q-progress-fill" style="width:${pct}%"></div></div>
    <div class="riasec-category">
      <div class="cat-header">
        <div class="cat-dot" style="background:${RIASEC_COLORS[cat]}"></div>
        <div class="cat-name">${cat} (${currentCatIdx + 1}/6)</div>
      </div>
  `;

  catQs.forEach((q, qi) => {
    const val = catAnswers[qi] || 0;
    html += `
      <div class="question-row">
        <div class="q-text">${qi + 1}. ${q.text}</div>
        <div class="likert" id="lk-${qi}">
          ${[1, 2, 3, 4, 5].map(n => `
            <label>
              <input type="radio" name="q${qi}" value="${n}" ${val === n ? 'checked' : ''} data-qi="${qi}" data-cat="${cat}" />
              <div class="dot"></div>
              <span class="num">${n}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  });

  html += `
      <div class="likert-labels"><span>Strongly Disagree</span><span>Strongly Agree</span></div>
    </div>
  `;

  const catDone = (catAnswers.length === catQs.length) && catAnswers.every(v => v > 0);
  const isLast = currentCatIdx === CAT_ORDER.length - 1;

  html += `
    ${state.error ? `<div class="error-banner">${state.error}</div>` : ''}
    <div class="btn-row">
      ${currentCatIdx > 0 ? `<button class="btn btn-secondary" id="btn-prev-cat">← Back</button>` : ''}
      ${!isLast ? `<button class="btn btn-primary" id="btn-next-cat" ${!catDone ? 'disabled' : ''}>Next Category →</button>` : ''}
      ${isLast ? `<button class="btn btn-primary" id="btn-submit-riasec" ${!catDone ? 'disabled' : ''}>Analyze My Profile →</button>` : ''}
    </div>
  `;

  return html;
}

// ─── OBJECTIVE 1 RESULTS ─────────────────────────────
function buildObj1Results() {
  const { careers, profile } = state.obj1Result;

  return `
    <div class="section-eyebrow">Step 1 Complete — RIASEC Results</div>
    <div class="section-title">Your Personality Profile</div>
    <div class="section-subtitle">Based on your responses, here is your RIASEC profile and top career matches by personality fit.</div>

    <div class="profile-bars">
      ${CAT_ORDER.map(c => `
        <div class="profile-bar-row">
          <div class="pb-label" style="color:${RIASEC_COLORS[c]}">${c}</div>
          <div class="pb-track">
            <div class="pb-fill" style="--target:${Math.round(profile[c] / 7 * 100)}%; background: linear-gradient(90deg, ${RIASEC_COLORS[c]}80, ${RIASEC_COLORS[c]})"></div>
          </div>
          <div class="pb-val">${profile[c].toFixed(2)}</div>
        </div>
      `).join('')}
    </div>

    <div class="divider"></div>
    <div class="section-eyebrow">Top Matches by Personality</div>

    <div class="career-grid">
      ${careers.map((c, i) => `
        <div class="career-card" style="cursor:default">
          <div class="career-rank">Match #${i + 1}</div>
          <div class="career-title">${c.title}</div>
          <div class="career-desc">${c.description || 'No description available.'}</div>
          <div class="career-meta">
            <span class="score-pill gold">Match ${(c.similarity_score * 100).toFixed(1)}%</span>
            <span class="score-pill muted">${c.onet_code}</span>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="btn-row">
      <button class="btn btn-primary" id="btn-goto-interests">Continue to Interest Matching →</button>
    </div>
  `;
}

// ─── INTERESTS ───────────────────────────────────────
function buildInterests() {
  return `
    <div class="section-eyebrow">Step 2 of 3 — Interest Matching</div>
    <div class="section-title">Describe what excites you</div>
    <div class="section-subtitle">
      Write freely about your interests, passions, subjects you love, work environments you prefer, or anything about the kind of work you want to do.
      The more detail, the better the match.
    </div>

    <div class="interest-box">
      <textarea id="interest-text" placeholder="e.g. I love working with data and finding patterns. I enjoy helping people learn new things. I'm fascinated by biology and enjoy writing...">${escHtml(state.interestText)}</textarea>
    </div>

    <div style="font-size:0.75rem;color:var(--muted);margin-bottom:1.5rem">
      Tip: Mention specific subjects, activities, skills, or work styles. Even hobbies are useful!
    </div>

    ${state.error ? `<div class="error-banner">${state.error}</div>` : ''}

    <div class="btn-row">
      <button class="btn btn-secondary" id="btn-back-to-obj1">← Back</button>
      <button class="btn btn-primary" id="btn-submit-interests">Find My Top 10 Careers →</button>
    </div>
  `;
}

// ─── TOP 10 CAREERS ──────────────────────────────────
function buildTop10() {
  const { top10, obj1_display } = state.obj2Result;

  return `
    <div class="section-eyebrow">Step 2 Complete — Hybrid Ranking</div>
    <div class="section-title">Your Top 10 Career Matches</div>
    <div class="section-subtitle">
      Ranked by a hybrid score: 75% interest match + 25% RIASEC personality fit.
      Click a career to select it for skill gap analysis.
    </div>

    ${obj1_display && obj1_display.length ? `
      <details style="margin-bottom:1.5rem;cursor:pointer">
        <summary style="font-size:0.8rem;color:var(--muted);list-style:none;display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0;border-top:1px solid var(--line)">
          <span style="color:var(--brass)">▸</span> View RIASEC top matches for reference
        </summary>
        <div style="margin-top:1rem;padding:1rem;background:var(--panel-raised);border-radius:8px;border:1px solid var(--line)">
          ${obj1_display.map(c => `
            <div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--line);font-size:0.82rem">
              <span style="color:var(--ink)">${c.title}</span>
              <span style="font-family:var(--ff-mono);font-size:0.7rem;color:var(--muted)">
                RIASEC ${(c.riasec_score * 100).toFixed(1)}% | Interest ${(c.interest_score * 100).toFixed(1)}%
              </span>
            </div>
          `).join('')}
        </div>
      </details>
    ` : ''}

    ${state.error ? `<div class="error-banner">${state.error}</div>` : ''}

    <div class="career-grid">
      ${top10.map((c, i) => `
        <div class="career-card ${state.selectedCareer === c.title ? 'selected' : ''}"
            data-title="${escHtml(c.title)}" id="career-${i}" tabindex="0" role="button">
          <div class="career-rank">Rank #${i + 1}</div>
          <div class="career-title">${c.title}</div>
          <div class="career-desc">${c.description || 'No description available.'}</div>
          <div class="career-meta">
            <span class="score-pill gold">Final ${(c.final_score * 100).toFixed(1)}%</span>
            <span class="score-pill teal">Interest ${(c.interest_score * 100).toFixed(1)}%</span>
            <span class="score-pill muted">${c.onet_code}</span>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="btn-row">
      <button class="btn btn-secondary" id="btn-back-to-interests">← Back</button>
      <button class="btn btn-primary" id="btn-goto-skillgap" ${!state.selectedCareer ? 'disabled' : ''}>
        Analyse Skill Gap →
      </button>
    </div>
  `;
}

// ─── SKILL GAP INPUT ─────────────────────────────────
function buildSkillGap() {
  return `
    <div class="section-eyebrow">Step 3 of 3 — Skill Gap Analysis</div>
    <div class="section-title">What skills do you already have?</div>
    <div class="section-subtitle">
      You selected: <strong style="color:var(--brass-dark)">${state.selectedCareer}</strong><br/>
      Enter your current skills so we can identify what you need to develop.
    </div>

    <div class="skill-input-wrap">
      <input type="text" id="skill-input" placeholder="python, excel, data analysis, communication, teamwork…" value="${escHtml(state.userSkills)}" />
      <div class="skill-hint">Separate skills with commas. Include both technical and soft skills.</div>
    </div>

    ${state.error ? `<div class="error-banner">${state.error}</div>` : ''}

    <div class="btn-row">
      <button class="btn btn-secondary" id="btn-back-to-top10">← Back</button>
      <button class="btn btn-primary" id="btn-submit-skills">Run Gap Analysis →</button>
    </div>
  `;
}

// ─── GAP RESULTS ─────────────────────────────────────
function buildGapResults() {
  const r = state.gapResult;
  const covPct = r.coverage_pct;
  const confPct = r.skill_match_confidence;

  const R = 54, cx = 70, cy = 70;
  const circ = 2 * Math.PI * R;
  const dash = (covPct / 100) * circ;
  const confTier = confPct >= 85 ? 'teal' : confPct >= 60 ? 'gold' : 'rose';

  return `
    <div class="section-eyebrow">Skill Gap Analysis — Results</div>
    <div class="section-title" style="margin-bottom:0.5rem">Skills Required</div>

    <div class="matched-job-note">
      Your selected career "<strong>${r.selected_career}</strong>" was matched to
      "<strong>${r.matched_job}</strong>" in the skills database.
    </div>

    <div class="gap-summary-grid">
      <div class="gap-stat">
        <div class="gap-stat-val gold" data-countup="${r.total_required}">0</div>
        <div class="gap-stat-label">Skills Required</div>
      </div>
      <div class="gap-stat">
        <div class="gap-stat-val teal" data-countup="${r.have.length}">0</div>
        <div class="gap-stat-label">You Already Have</div>
      </div>
      <div class="gap-stat">
        <div class="gap-stat-val rose" data-countup="${r.gap.length}">0</div>
        <div class="gap-stat-label">Skills to Develop</div>
      </div>
      <div class="gap-stat">
        <div class="gap-stat-val ${covPct >= 60 ? 'teal' : covPct >= 30 ? 'gold' : 'rose'}" data-countup="${covPct}" data-suffix="%">0%</div>
        <div class="gap-stat-label">Coverage</div>
      </div>
      <div class="gap-stat confidence">
        <div class="gap-stat-val ${confTier}" data-countup="${confPct}" data-suffix="%">0%</div>
        <div class="gap-stat-label">Skills Recommendation Confidence<span class="info-dot" title="How confident the match between your selected career and the matched skills-database role is"></span></div>
      </div>
    </div>

    <div class="coverage-ring">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--line)" stroke-width="10"/>
        <circle data-fill cx="${cx}" cy="${cy}" r="${R}" fill="none"
          stroke="${covPct >= 60 ? 'var(--teal)' : covPct >= 30 ? 'var(--brass)' : 'var(--rose)'}"
          stroke-width="10"
          stroke-linecap="round"
          stroke-dasharray="0 ${circ}"
          data-dash="${dash}" data-circ="${circ}"
          transform="rotate(-90 ${cx} ${cy})"
        />
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle"
              font-family="Newsreader" font-size="18" fill="var(--ink)">${covPct}%</text>
        <text x="${cx}" y="${cy + 22}" text-anchor="middle"
              font-family="IBM Plex Mono" font-size="9" fill="var(--muted)" letter-spacing="1">COVERAGE</text>
      </svg>
    </div>

    <div class="skill-columns">
      <div>
        <div class="skill-col-header">
          <span class="skill-col-title have">Skills You Have (${r.have.length})</span>
        </div>
        <div>
          ${r.have.length ? r.have.map(s => `<span class="skill-tag have">✓ ${s}</span>`).join('') : '<span style="color:var(--muted);font-size:0.82rem">None matched</span>'}
        </div>
      </div>
      <div>
        <div class="skill-col-header">
          <span class="skill-col-title gap">Skills to Develop (${r.gap.length})</span>
        </div>
        <div>
          ${r.gap.length ? r.gap.map(s => `<span class="skill-tag gap">+ ${s}</span>`).join('') : '<span style="color:var(--teal);font-size:0.82rem">You have all the required skills.</span>'}
        </div>
      </div>
    </div>

    <div class="btn-row">
      <button class="btn btn-secondary" id="btn-restart">Start Over</button>
      <button class="btn btn-primary" id="btn-back-to-top10-from-results">Try Another Career</button>
    </div>
  `;
}

// ─── HELPERS ─────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setLoading(v, key) {
  state.loading = v;
  if (key) state.loadingKey = key;
  render();
}

async function apiCall(path, body) {
  const opts = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'GET' };
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'API error');
  return data;
}

function on(id, evt, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(evt, handler);
}

function resetAssessment() {
  state.step = 0;
  state.answers = {};
  state.obj1Result = null;
  state.interestText = '';
  state.obj2Result = null;
  state.selectedCareer = null;
  state.userSkills = '';
  state.gapResult = null;
  state.error = null;
  currentCatIdx = 0;
}

// ─── EVENTS ──────────────────────────────────────────
function attachEvents() {
  // Welcome
  on('btn-start', 'click', async () => {
    state.error = null;
    if (!state.questions.length) {
      setLoading(true, 'questions');
      try {
        const d = await apiCall('/api/questions');
        state.questions = d.questions;
      } catch (e) {
        state.error = e.message;
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    currentCatIdx = 0;
    state.step = 1;
    render();
  });

  // RIASEC nav
  on('btn-prev-cat', 'click', () => { currentCatIdx--; render(); });

  on('btn-next-cat', 'click', () => { currentCatIdx++; render(); });

  on('btn-submit-riasec', 'click', async () => {
    state.error = null;
    setLoading(true, 'objective1');
    try {
      const d = await apiCall('/api/objective1', { answers: state.answers });
      state.obj1Result = { careers: d.careers, profile: d.profile };
      state.step = 2;
    } catch (e) {
      state.error = e.message;
    }
    setLoading(false);
  });

  // RIASEC likert inputs
  document.querySelectorAll('.likert input[type="radio"]').forEach(input => {
    input.addEventListener('change', (e) => {
      const qi = parseInt(e.target.dataset.qi, 10);
      const cat = e.target.dataset.cat;
      const val = parseInt(e.target.value, 10);
      if (!state.answers[cat]) state.answers[cat] = [];
      state.answers[cat][qi] = val;
      render();
    });
  });

  // Objective 1 results
  on('btn-goto-interests', 'click', () => { state.step = 3; render(); });

  // Interests
  on('interest-text', 'input', (e) => { state.interestText = e.target.value; });

  on('btn-back-to-obj1', 'click', () => { state.step = 2; render(); });

  on('btn-submit-interests', 'click', async () => {
    state.error = null;
    if (!state.interestText || !state.interestText.trim()) {
      state.error = 'Tell us a little about your interests before continuing.';
      render();
      return;
    }
    setLoading(true, 'objective2');
    try {
      const d = await apiCall('/api/objective2', {
        user_text: state.interestText,
      });
      state.obj2Result = { top10: d.top10, obj1_display: d.obj1_display };
      state.selectedCareer = null;
      state.step = 4;
    } catch (e) {
      state.error = e.message;
    }
    setLoading(false);
  });

  // Top 10 — select a career
  document.querySelectorAll('.career-grid .career-card[data-title]').forEach(card => {
    const select = () => {
      state.selectedCareer = card.dataset.title;
      state.error = null;
      render();
    };
    card.addEventListener('click', select);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
    });
  });

  on('btn-back-to-interests', 'click', () => { state.step = 3; render(); });

  on('btn-goto-skillgap', 'click', () => {
    if (!state.selectedCareer) return;
    state.step = 5;
    render();
  });

  // Skill gap input
  on('skill-input', 'input', (e) => { state.userSkills = e.target.value; });

  on('btn-back-to-top10', 'click', () => { state.step = 4; render(); });

  on('btn-submit-skills', 'click', async () => {
    state.error = null;
    if (!state.userSkills || !state.userSkills.trim()) {
      state.error = 'Enter at least one skill so we can measure your coverage.';
      render();
      return;
    }
    setLoading(true, 'skillgap');
    try {
      const d = await apiCall('/api/objective3', {
        selected_title: state.selectedCareer,
        user_skills: state.userSkills,
      });
      state.gapResult = d;
      state.step = 6;
    } catch (e) {
      state.error = e.message;
    }
    setLoading(false);
  });

  // Gap results
  on('btn-restart', 'click', () => { resetAssessment(); render(); });

  on('btn-back-to-top10-from-results', 'click', () => {
    state.selectedCareer = null;
    state.userSkills = '';
    state.gapResult = null;
    state.step = 4;
    render();
  });
}

// ─── INIT ────────────────────────────────────────────
render();


/* ════════════════════════════════════════════════════════
  CareerCompass — vanilla JS SPA
  No bundler required. Runs from Flask static folder.

  Redesign note: the visual language is a clear, well-lit
  workspace. Progress is tracked with a simple path rail —
  numbered stops on a line — instead of a compass instrument.
  All markup below is written to match style.css.

  API contract (matches app.py):
    GET  /api/questions                 -> { questions }
    POST /api/objective1  { answers }   -> { careers, profile }
    POST /api/objective2  { user_text }
                                          -> { top10, obj1_display }
    POST /api/objective3  { selected_title, user_skills }
                                          -> { selected_career, matched_job,
                                              total_required, have, gap,
                                              coverage_pct, skill_match_confidence }
════════════════════════════════════════════════════════ */