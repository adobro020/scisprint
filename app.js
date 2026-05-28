
(() => {
  const DATA = window.APP_DATA;
  const STORE_KEY = "scisprint.progress.v1";
  const DAILY_GOAL = 50;
  const MAX_HEARTS = 5;
  const app = document.getElementById("app");
  let session = null;
  let state = loadState();
  let flashState = { lid: null, index: 0, flipped: false };

  function todayKey(date = new Date()) { return date.toISOString().slice(0, 10); }
  function yesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return todayKey(d); }
  function defaultState() {
    return { xp: 0, hearts: MAX_HEARTS, streak: 0, lastStudyDate: null, daily: { date: todayKey(), xp: 0 }, completed: {}, mistakes: {}, totalCorrect: 0, totalAnswered: 0, soundOn: true };
  }
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null") || defaultState();
      const t = todayKey();
      if (!saved.daily || saved.daily.date !== t) saved.daily = { date: t, xp: 0 };
      if (saved.lastHeartRefresh !== t) { saved.hearts = Math.max(saved.hearts || 0, MAX_HEARTS); saved.lastHeartRefresh = t; }
      return { ...defaultState(), ...saved };
    } catch { return defaultState(); }
  }
  function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  function studyPulse(xp) {
    const t = todayKey();
    if (state.lastStudyDate !== t) {
      state.streak = state.lastStudyDate === yesterdayKey() ? (state.streak || 0) + 1 : 1;
      state.lastStudyDate = t;
    }
    state.xp += xp;
    state.daily = state.daily && state.daily.date === t ? state.daily : { date: t, xp: 0 };
    state.daily.xp += xp;
    saveState();
  }
  function escapeHTML(value = "") {
    return String(value).replace(/[&<>'"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[ch]));
  }
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  let audioCtx = null;
  let masterGain = null;
  function getAudioContext() {
    if (!state.soundOn) return null;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    try {
      audioCtx = audioCtx || new AudioContext();
      if (!masterGain) {
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.72;
        masterGain.connect(audioCtx.destination);
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    } catch {
      return null;
    }
  }
  function shapeTone(ctx, opts) {
    const {
      freq, start, duration, type = "sine", volume = 0.06,
      attack = 0.012, release = 0.045, slideTo = null, pan = 0, detune = 0
    } = opts;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const stereo = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration * .88);
    osc.detune.setValueAtTime(detune, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), start + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(volume * .62, 0.0002), start + Math.max(attack + .015, duration * .45));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration + release);
    if (stereo) {
      stereo.pan.setValueAtTime(pan, start);
      osc.connect(gain).connect(stereo).connect(masterGain || ctx.destination);
    } else {
      osc.connect(gain).connect(masterGain || ctx.destination);
    }
    osc.start(start);
    osc.stop(start + duration + release + .025);
  }
  function noiseBurst(ctx, start, duration = .05, volume = .03, filterFreq = 4200) {
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    src.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(filterFreq, start);
    filter.Q.setValueAtTime(1.2, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter).connect(gain).connect(masterGain || ctx.destination);
    src.start(start);
    src.stop(start + duration + .02);
  }
  function playSound(name, combo = 1) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime + 0.006;
    const comboSteps = name === 'correct' ? Math.min(Math.max(combo - 1, 0), 10) : 0;
    const pitchLift = Math.pow(2, comboSteps / 12);
    const make = (freq, offset, duration, type, volume, extra = {}) => shapeTone(ctx, {
      freq: freq * pitchLift,
      start: now + offset,
      duration,
      type,
      volume,
      ...extra
    });
    if (name === 'tap') {
      make(520, 0, .035, 'triangle', .028, { slideTo: 700, release: .025 });
      noiseBurst(ctx, now + .002, .018, .011, 6000);
      return;
    }
    if (name === 'flip') {
      make(330, 0, .045, 'triangle', .024, { slideTo: 510, pan: -.12, release: .025 });
      make(660, .032, .055, 'sine', .024, { slideTo: 540, pan: .12, release: .035 });
      noiseBurst(ctx, now + .012, .045, .014, 5200);
      return;
    }
    if (name === 'correct') {
      const vol = Math.min(.078, .055 + comboSteps * .003);
      make(523.25, 0, .085, 'triangle', vol, { pan: -.08, release: .04 });
      make(659.25, .072, .092, 'triangle', vol, { pan: .04, release: .04 });
      make(783.99, .15, .13, 'sine', vol * .9, { pan: .12, release: .055 });
      if (comboSteps >= 2) make(1046.5, .245, .105, 'sine', .032, { release: .08, detune: 4 });
      noiseBurst(ctx, now + .21, .035, .012 + comboSteps * .001, 7600);
      return;
    }
    if (name === 'wrong') {
      shapeTone(ctx, { freq: 246.94, start: now, duration: .11, type: 'sawtooth', volume: .034, slideTo: 207.65, release: .065, pan: -.05 });
      shapeTone(ctx, { freq: 185.0, start: now + .105, duration: .16, type: 'triangle', volume: .032, slideTo: 146.83, release: .08, pan: .05 });
      noiseBurst(ctx, now + .06, .05, .012, 900);
      return;
    }
    if (name === 'locked') {
      shapeTone(ctx, { freq: 174.61, start: now, duration: .08, type: 'square', volume: .018, release: .04 });
      shapeTone(ctx, { freq: 164.81, start: now + .09, duration: .1, type: 'square', volume: .016, release: .05 });
      return;
    }
    if (name === 'complete') {
      const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
      notes.forEach((n, i) => shapeTone(ctx, { freq: n, start: now + i * .085, duration: i === notes.length - 1 ? .32 : .11, type: i < 3 ? 'triangle' : 'sine', volume: i === notes.length - 1 ? .06 : .052, release: .09, pan: (i - 2) * .08 }));
      shapeTone(ctx, { freq: 1318.5, start: now + .46, duration: .16, type: 'sine', volume: .026, release: .12, pan: .18 });
      noiseBurst(ctx, now + .37, .12, .022, 8400);
      return;
    }
    make(440, 0, .06, 'triangle', .025);
  }
  function toggleSound() {
    state.soundOn = !state.soundOn;
    saveState();
    if (state.soundOn) playSound('correct');
    route();
  }
  function allLessons() { return DATA.courses.flatMap(c => c.lessons.map(l => ({ course: c, lesson: l }))); }
  function allQuestions() { return allLessons().flatMap(({ course, lesson }) => lesson.questions.map(q => ({ ...q, courseTitle: course.title, lessonTitle: lesson.title }))); }
  function getCourse(cid) { return DATA.courses.find(c => c.id === cid); }
  function getLesson(cid, lid) { return getCourse(cid)?.lessons.find(l => l.id === lid); }
  function completedLessonIds() { return Object.keys(state.completed || {}); }
  function isDone(lid) { return Boolean(state.completed && state.completed[lid]); }
  function isUnlocked(course, idx) { return true; }
  function coursePct(course) { return Math.round((course.lessons.filter(l => isDone(l.id)).length / course.lessons.length) * 100); }
  function activeNav(name) { return location.hash.includes(name) ? "active" : ""; }
  function flashPromptFor(point, idx, lessonTitle) {
    const text = String(point || '').replace(/\s+/g, ' ').trim();
    const dashParts = text.split(/\s+—\s+/).filter(Boolean);
    if (dashParts.length >= 2) return { front: dashParts[0], back: dashParts.slice(1).join(' — ') };
    const colon = text.match(/^([^:]{3,80}):\s*(.+)$/);
    if (colon) return { front: colon[1], back: colon[2] };
    const equals = text.match(/^([^=]{2,80})\s*=\s*(.+)$/);
    if (equals) return { front: equals[1].trim(), back: equals[2].trim() };
    const isDef = text.match(/^(?:A|An|The)?\s*([^.!?]{2,70}?)\s+(?:is|are|means)\s+(.+)$/i);
    if (isDef) {
      const term = isDef[1].trim().replace(/^a\s+|^an\s+|^the\s+/i, '');
      return { front: `What ${/s$/i.test(term) ? 'are' : 'is'} ${term}?`, back: isDef[2].trim() };
    }
    const arrow = text.match(/^([^→]{2,80})\s*→\s*(.+)$/);
    if (arrow) return { front: arrow[1].trim(), back: arrow[2].trim() };
    return { front: `${lessonTitle}: key idea ${idx + 1}`, back: text };
  }
  function flashcardsForLesson(lesson) {
    const rawPoints = Array.isArray(lesson?.keyPoints) ? lesson.keyPoints.filter(Boolean) : [];
    const points = rawPoints.length ? rawPoints : (lesson?.questions || []).map(q => `${q.answerText || 'Answer'} — ${q.explanation || q.question}`);
    return points.map((p, i) => flashPromptFor(p, i, lesson.title));
  }
  function ensureFlashState(lid, total) {
    if (flashState.lid !== lid) flashState = { lid, index: 0, flipped: false };
    flashState.index = Math.max(0, Math.min(flashState.index || 0, Math.max(total - 1, 0)));
  }
  function renderCurrentLesson() {
    const parts = (location.hash || '').replace(/^#\/?/, '').split('/');
    if (parts[0] === 'lesson') renderLesson(parts[1], parts[2]);
  }
  function flipFlashcard() {
    flashState.flipped = !flashState.flipped;
    renderCurrentLesson();
  }
  function stepFlashcard(delta) {
    const parts = (location.hash || '').replace(/^#\/?/, '').split('/');
    if (parts[0] !== 'lesson') return;
    const lesson = getLesson(parts[1], parts[2]);
    if (!lesson) return;
    const total = flashcardsForLesson(lesson).length;
    flashState.index = Math.max(0, Math.min((flashState.index || 0) + delta, total - 1));
    flashState.flipped = false;
    renderCurrentLesson();
  }
  function flashcardHTML(lesson, lid) {
    const cards = flashcardsForLesson(lesson);
    ensureFlashState(lid, cards.length);
    const current = cards[flashState.index] || { front: 'Study', back: 'Review this lesson.' };
    const i = flashState.index;
    const flipped = flashState.flipped;
    return `<div class="flashcard-module">
      <div class="flashcard-head row"><div><b>Flashcards</b><p class="small">Tap the card to flip it, then move through the deck.</p></div><span class="pill">${i + 1}/${cards.length}</span></div>
      <button class="flashcard ${flipped ? 'flipped' : ''}" data-action="flip-card" aria-label="Flip flashcard" aria-pressed="${flipped}">
        <span class="flashcard-inner">
          <span class="flashcard-face flashcard-front"><span class="flashcard-label">Front</span><span class="flashcard-text">${escapeHTML(current.front)}</span><span class="flashcard-hint">Tap to reveal</span></span>
          <span class="flashcard-face flashcard-back"><span class="flashcard-label">Back</span><span class="flashcard-text">${escapeHTML(current.back)}</span><span class="flashcard-hint">Tap to hide</span></span>
        </span>
      </button>
      <div class="flashcard-controls">
        <button class="mini-btn" data-action="flash-prev" ${i === 0 ? 'disabled' : ''}>‹ Previous</button>
        <button class="mini-btn strong" data-action="flip-card">Flip</button>
        <button class="mini-btn" data-action="flash-next" ${i === cards.length - 1 ? 'disabled' : ''}>Next ›</button>
      </div>
      <p class="small flashcard-keys">Keyboard: Space flips · ←/→ changes cards</p>
    </div>`;
  }
  function header(title = DATA.appName, backTarget = null) {
    return `<header class="topbar">
      <div class="brand">${backTarget ? `<button class="back" data-route="${backTarget}" aria-label="Go back">‹</button>` : `<span class="logo">⚗️</span>`}<span>${escapeHTML(title)}</span></div>
      <div class="stats"><span class="pill">🔥 ${state.streak || 0}</span><span class="pill">❤️ ${state.hearts ?? MAX_HEARTS}</span><span class="pill">⭐ ${state.xp || 0}</span><button class="pill sound-toggle" data-action="toggle-sound" aria-label="${state.soundOn ? 'Mute sounds' : 'Unmute sounds'}">${state.soundOn ? '🔊' : '🔇'}</button></div>
    </header>`;
  }
  function bottomNav() {
    return `<nav class="bottom-nav">
      <button class="nav-btn ${activeNav('/home') || (!location.hash || location.hash === '#') ? 'active' : ''}" data-route="#/home"><span class="ico">🏠</span>Home</button>
      <button class="nav-btn ${activeNav('/course') ? 'active' : ''}" data-route="#/home"><span class="ico">🗺️</span>Map</button>
      <button class="nav-btn ${activeNav('/profile') || activeNav('/review') ? 'active' : ''}" data-route="#/profile"><span class="ico">👤</span>Profile</button>
    </nav>`;
  }
  function renderHome() {
    const lessons = allLessons();
    const totalDone = completedLessonIds().length;
    const dailyPct = Math.min(100, Math.round(((state.daily?.xp || 0) / DAILY_GOAL) * 100));
    app.innerHTML = `${header()}
      <section class="screen">
        <div class="hero"><div class="mascot">🧠</div><h1>Learn science in tiny wins.</h1><p>${escapeHTML(DATA.subtitle)} built from your uploaded study guide.</p></div>
        <div class="section-title row"><span>Today’s goal</span><span class="small">${state.daily?.xp || 0}/${DAILY_GOAL} XP</span></div>
        <div class="card"><div class="progress-track"><div class="progress-fill" style="width:${dailyPct}%"></div></div><p class="small" style="margin:10px 0 0">Complete one lesson or mixed review to keep your streak alive.</p></div>
        <div class="section-title row"><span>Courses</span><span class="small">${totalDone}/${lessons.length} lessons</span></div>
        <div class="course-grid">${DATA.courses.map((c, idx) => `
          <button class="course-card" style="--i:${idx}" data-route="#/course/${c.id}">
            <span class="course-emoji">${c.emoji}</span>
            <span><h3>${escapeHTML(c.title)}</h3><p>${escapeHTML(c.tagline)}</p><div class="progress-track"><div class="progress-fill" style="width:${coursePct(c)}%"></div></div></span>
            <span class="chev">›</span>
          </button>`).join("")}</div>
        <div class="section-title">Quick practice</div>
        <button class="big-btn secondary" data-action="mixed">⚡ Mixed 8-question review</button>
      </section>${bottomNav()}`;
  }
  function renderCourse(cid) {
    const course = getCourse(cid);
    if (!course) return renderHome();
    const done = course.lessons.filter(l => isDone(l.id)).length;
    app.innerHTML = `${header(course.emoji + ' ' + course.title, '#/home')}
      <section class="screen">
        <div class="lesson-hero"><div class="small">${done}/${course.lessons.length} lessons complete</div><h1>${escapeHTML(course.title)}</h1><p>${escapeHTML(course.tagline)}</p><div class="progress-track" style="margin-top:14px"><div class="progress-fill" style="width:${coursePct(course)}%"></div></div></div>
        <div class="section-title">Lesson path</div>
        <div class="map">${course.lessons.map((lesson, idx) => {
          const done = isDone(lesson.id);
          const bubbleClass = done ? 'done' : 'active';
          const icon = done ? '✓' : course.emoji;
          return `<button class="lesson-node" style="--i:${idx}" data-route="#/lesson/${course.id}/${lesson.id}">
            <span class="bubble ${bubbleClass}">${icon}</span>
            <span class="lesson-card"><span><h3>${lesson.order}. ${escapeHTML(lesson.title)}</h3><p>${lesson.questionCount} challenge${lesson.questionCount === 1 ? '' : 's'} · ${lesson.keyPoints.length} flashcards</p></span><span class="chev">›</span></span>
          </button>`;
        }).join("")}</div>
      </section>${bottomNav()}`;
  }
  function renderLesson(cid, lid) {
    const course = getCourse(cid); const lesson = getLesson(cid, lid);
    if (!course || !lesson) return renderHome();
    app.innerHTML = `${header('Lesson', `#/course/${cid}`)}
      <section class="screen">
        <div class="lesson-hero"><div class="small">${course.emoji} ${escapeHTML(course.title)} · Lesson ${lesson.order}</div><h1>${escapeHTML(lesson.title)}</h1><p>${lesson.questionCount} challenge questions. Study the flashcards, then test yourself.</p></div>
        <div class="section-title">Flashcard deck</div>
        ${flashcardHTML(lesson, lid)}
        <button class="big-btn" data-action="start-lesson" data-course="${cid}" data-lesson="${lid}">${isDone(lid) ? 'Practice again' : 'Start challenge'}</button>
      </section>${bottomNav()}`;
  }
  function buildLessonSession(cid, lid) {
    const course = getCourse(cid); const lesson = getLesson(cid, lid);
    session = { mode: 'lesson', cid, lid, title: lesson.title, subtitle: course.title, questions: shuffle(lesson.questions).map(q => ({ ...q, options: shuffle(q.options) })), index: 0, correct: 0, wrong: 0, xp: 0, selected: null, locked: false, combo: 0, maxCombo: 0 };
    renderQuiz();
  }
  function buildMixedSession() {
    const qs = shuffle(allQuestions()).slice(0, 8);
    session = { mode: 'mixed', title: 'Mixed Review', subtitle: 'All science courses', questions: qs.map(q => ({ ...q, options: shuffle(q.options) })), index: 0, correct: 0, wrong: 0, xp: 0, selected: null, locked: false, combo: 0, maxCombo: 0 };
    renderQuiz();
  }
  function buildReviewSession() {
    const mistakeIds = Object.keys(state.mistakes || {});
    const byId = Object.fromEntries(allQuestions().map(q => [q.id, q]));
    const qs = mistakeIds.map(id => byId[id]).filter(Boolean);
    if (!qs.length) return toast('No mistakes to review yet. Try a lesson first!');
    session = { mode: 'review', title: 'Mistake Review', subtitle: 'Practice missed questions', questions: shuffle(qs).slice(0, 12).map(q => ({ ...q, options: shuffle(q.options) })), index: 0, correct: 0, wrong: 0, xp: 0, selected: null, locked: false, combo: 0, maxCombo: 0 };
    renderQuiz();
  }
  function renderQuiz() {
    if (!session) return renderHome();
    if (session.index >= session.questions.length) return renderComplete();
    const q = session.questions[session.index];
    const pct = Math.round((session.index / session.questions.length) * 100);
    app.innerHTML = `<div class="quiz-top"><button class="close" data-action="quit-quiz">×</button><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><div class="quiz-controls"><span class="pill">❤️ ${state.hearts ?? MAX_HEARTS}</span>${(session.combo || 0) > 1 ? `<span class="pill combo-pill">${session.combo} in a row</span>` : ''}<button class="pill sound-toggle" data-action="toggle-sound" aria-label="${state.soundOn ? 'Mute sounds' : 'Unmute sounds'}">${state.soundOn ? '🔊' : '🔇'}</button></div></div>
      <section class="screen">
        <div class="question-card">
          <div class="question-kicker">${session.mode === 'lesson' ? 'Lesson challenge' : session.title} · ${session.index + 1}/${session.questions.length}</div>
          <h1 class="question">${escapeHTML(q.question)}</h1>
          <div class="options">${q.options.map(opt => {
            let cls = '';
            if (session.selected) cls = opt.letter === q.answer ? 'correct' : (opt.letter === session.selected ? 'wrong' : '');
            return `<button class="option ${cls}" ${session.selected ? 'disabled' : ''} data-action="answer" data-letter="${opt.letter}"><span class="option-letter">${opt.letter}</span><span>${escapeHTML(opt.text)}</span></button>`;
          }).join("")}</div>
        </div>
        <p class="small" style="text-align:center;margin-top:14px">${escapeHTML(session.subtitle || '')}</p>
      </section>${session.selected ? feedbackHTML() : ''}`;
  }
  function feedbackHTML() {
    const q = session.questions[session.index];
    const good = session.selected === q.answer;
    const explanation = q.explanation || `Correct answer: ${q.answer}. ${q.answerText || ''}`;
    const comboNote = good && (session.combo || 0) > 1 ? `<p class="small">${session.combo} in a row — keep going!</p>` : '';
    return `<div class="feedback ${good ? 'good' : 'bad'}"><h3>${good ? 'Nice!' : 'Not quite'}</h3><p>${escapeHTML(explanation)}</p>${comboNote}<button class="big-btn ${good ? '' : 'danger'}" data-action="next-question">Continue</button></div>`;
  }
  function answer(letter) {
    if (!session || session.selected) return;
    const q = session.questions[session.index];
    session.selected = letter;
    const correct = letter === q.answer;
    state.totalAnswered += 1;
    if (correct) {
      session.combo = (session.combo || 0) + 1;
      session.maxCombo = Math.max(session.maxCombo || 0, session.combo);
      playSound('correct', session.combo);
      session.correct += 1;
      session.xp += 10;
      state.totalCorrect += 1;
      delete state.mistakes[q.id];
      studyPulse(10);
    } else {
      session.combo = 0;
      playSound('wrong');
      session.wrong += 1;
      state.hearts = Math.max(0, (state.hearts ?? MAX_HEARTS) - 1);
      state.mistakes[q.id] = { at: new Date().toISOString(), question: q.question, answer: q.answerText };
      saveState();
    }
    renderQuiz();
  }
  function nextQuestion() { session.selected = null; session.index += 1; renderQuiz(); }
  function renderComplete() {
    const pass = session.correct >= Math.ceil(session.questions.length * 0.6);
    let bonus = 0;
    if (session.mode === 'lesson' && pass && !isDone(session.lid)) { state.completed[session.lid] = new Date().toISOString(); bonus = 20; studyPulse(bonus); }
    saveState();
    playSound('complete');
    confetti();
    const back = session.mode === 'lesson' ? `#/course/${session.cid}` : '#/home';
    app.innerHTML = `${header('Complete', back)}
      <section class="screen complete"><div style="width:100%"><div class="trophy">${pass ? '🏆' : '💪'}</div><h1>${pass ? 'Lesson complete!' : 'Keep practicing!'}</h1><p class="small">${escapeHTML(session.title)}</p>
      <div class="stat-grid"><div class="stat-card"><b>${session.correct}</b><span class="small">Correct</span></div><div class="stat-card"><b>${session.wrong}</b><span class="small">Missed</span></div><div class="stat-card"><b>${session.xp + bonus}</b><span class="small">XP</span></div><div class="stat-card"><b>${session.maxCombo || 0}</b><span class="small">Best combo</span></div></div>
      ${bonus ? '<div class="badge-row"><span class="badge">🎉 First clear +20 XP</span></div>' : ''}
      <button class="big-btn" data-route="${back}">Continue</button></div></section>${bottomNav()}`;
  }
  function renderProfile() {
    const total = state.totalAnswered || 0;
    const acc = total ? Math.round(((state.totalCorrect || 0) / total) * 100) : 0;
    const done = completedLessonIds().length;
    const mistakeCount = Object.keys(state.mistakes || {}).length;
    app.innerHTML = `${header('Profile', '#/home')}
      <section class="screen">
        <div class="card profile-head"><div class="avatar">🧪</div><div><h2 style="margin:0;letter-spacing:-.04em">Science sprinter</h2><p class="small" style="margin:5px 0 0">Keep earning XP to finish every course.</p></div></div>
        <div class="section-title">Stats</div>
        <div class="stat-grid"><div class="stat-card"><b>${state.xp || 0}</b><span class="small">XP</span></div><div class="stat-card"><b>${state.streak || 0}</b><span class="small">Streak</span></div><div class="stat-card"><b>${acc}%</b><span class="small">Accuracy</span></div></div>
        <div class="card"><div class="row"><b>Course progress</b><span class="small">${done}/${allLessons().length}</span></div><div class="progress-track" style="margin-top:10px"><div class="progress-fill" style="width:${Math.round(done / allLessons().length * 100)}%"></div></div></div>
        <div class="section-title">Practice</div>
        <button class="big-btn secondary" data-action="review">🧠 Review mistakes (${mistakeCount})</button>
        <button class="big-btn secondary" style="margin-top:10px" data-action="mixed">⚡ Mixed review</button>
        <button class="big-btn danger" style="margin-top:10px" data-action="reset">Reset progress</button>
      </section>${bottomNav()}`;
  }
  function route() {
    const hash = location.hash || '#/home';
    const parts = hash.replace(/^#\/?/, '').split('/');
    if (parts[0] === 'course') return renderCourse(parts[1]);
    if (parts[0] === 'lesson') return renderLesson(parts[1], parts[2]);
    if (parts[0] === 'profile') return renderProfile();
    return renderHome();
  }
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }
  function confetti() {
    const wrap = document.createElement('div');
    wrap.className = 'confetti';
    for (let i = 0; i < 42; i++) {
      const piece = document.createElement('i');
      piece.style.left = Math.random() * 100 + '%';
      piece.style.animationDelay = Math.random() * .55 + 's';
      piece.style.transform = `rotate(${Math.random()*160}deg)`;
      wrap.appendChild(piece);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 2000);
  }
  app.addEventListener('click', (e) => {
    const routeBtn = e.target.closest('[data-route]');
    const locked = e.target.closest('[data-locked]');
    const action = e.target.closest('[data-action]');
    if (routeBtn) { playSound('tap'); location.hash = routeBtn.dataset.route; return; }
    if (locked) { playSound('locked'); toast('Pick any lesson to practice.'); return; }
    if (!action) return;
    const a = action.dataset.action;
    if (a === 'toggle-sound') { toggleSound(); return; }
    if (a === 'flip-card') { playSound('flip'); flipFlashcard(); return; }
    if (!['answer', 'next-question'].includes(a)) playSound('tap');
    if (a === 'flash-prev') { stepFlashcard(-1); return; }
    if (a === 'flash-next') { stepFlashcard(1); return; }
    if (a === 'start-lesson') buildLessonSession(action.dataset.course, action.dataset.lesson);
    if (a === 'answer') answer(action.dataset.letter);
    if (a === 'next-question') nextQuestion();
    if (a === 'quit-quiz') { const back = session?.mode === 'lesson' ? `#/lesson/${session.cid}/${session.lid}` : '#/home'; session = null; location.hash = back; }
    if (a === 'mixed') buildMixedSession();
    if (a === 'review') buildReviewSession();
    if (a === 'reset') { if (confirm('Reset all progress and XP?')) { state = defaultState(); saveState(); route(); } }
  });
  window.addEventListener('keydown', (e) => {
    if (session || !(location.hash || '').includes('#/lesson/')) return;
    const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
    if (['button', 'input', 'textarea', 'select'].includes(tag)) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); playSound('flip'); flipFlashcard(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); playSound('tap'); stepFlashcard(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); playSound('tap'); stepFlashcard(1); }
  });
  window.addEventListener('hashchange', () => { session = null; route(); });
  route();
})();
