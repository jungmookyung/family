/* 우리 집 Kid Hub — app logic
 * 데이터: 브라우저 localStorage + GitHub(비공개 저장소) data.json 양방향 동기화
 */
(() => {
  'use strict';

  const DATA_KEY = 'kidHub.data.v1';
  const SETTINGS_KEY = 'kidHub.settings.v1';
  const TOKEN_KEY = 'kidHub.ghToken.v1';
  const VERSION = '1.0.0';

  const TAGS = ['#어린이집', '#준비물', '#서류·신청', '#병원', '#교육'];
  const KIDS = ['지우', '지민'];
  const OWNERS = ['무경', '우경'];
  const REPEATS = ['', '매일', '매주', '매월'];
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  const DEFAULT_DATA = {
    version: 2,
    updatedAt: '2026-11-24T08:40:00+09:00',
    todos: [
      {
        id: 't-20261124-01',
        title: '지우 배추뽑기 등원',
        note: '09:40 도보, 편한 복장·이불·여벌 바지',
        date: '2026-11-24',
        assignee: null,
        child: '지우',
        tags: ['#어린이집', '#준비물'],
        repeat: null,
        done: false
      },
      {
        id: 't-20261125-01',
        title: '지우 수료·졸업 사진 촬영일 확인',
        note: '25일 수 vs 26일 목',
        date: '2026-11-25',
        assignee: '우경',
        child: '지우',
        tags: ['#어린이집'],
        repeat: null,
        done: false
      },
      {
        id: 't-20261127-01',
        title: '빈 우유갑 모아 어린이집 보내기',
        note: null,
        date: '2026-11-27',
        assignee: null,
        child: '지우',
        tags: ['#어린이집', '#준비물'],
        repeat: null,
        done: false
      }
    ],
    events: [
      {
        id: 'e-20261126-01',
        title: '지우 11월 생일파티',
        date: '2026-11-26',
        time: null,
        endTime: null,
        child: '지우',
        tags: ['#어린이집'],
        note: null
      }
    ],
    experiences: [],
    people: [
      { id: 'p-mg', name: '무경', role: '아빠', emoji: '👨', memo: '' },
      { id: 'p-ug', name: '우경', role: '엄마', emoji: '👩', memo: '' },
      { id: 'p-ju', name: '지우', role: '4살 · 어린이집', emoji: '🧒', memo: '' },
      { id: 'p-jm', name: '지민', role: '2살 · 어린이집', emoji: '👶', memo: '' }
    ],
    places: [
      { id: 'pl-1', name: '어린이집', memo: '지우·지민 등원' },
      { id: 'pl-2', name: '소아과', memo: '' }
    ]
  };

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    repo: 'jungmookyung/mk-automation',
    branch: 'kid-hub',
    path: 'data.json',
    lastSyncAt: null,
    lastSyncSha: null
  };

  let data = null;
  let settings = null;
  let ui = { tab: 'todos', child: '전체', tag: null, hideDone: true, expChild: '전체' };
  let saveTimer = null;
  let syncing = false;

  /* ---------- utils ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseDate(s) {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  function fmtMD(s) {
    const d = parseDate(s);
    return d ? `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}` : '';
  }
  function dueClass(s) {
    const d = parseDate(s);
    if (!d) return '';
    const t = new Date();
    const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    if (d.getTime() === today.getTime()) return 'today';
    return d < today ? 'overdue' : '';
  }
  function weekday(s) {
    const d = parseDate(s);
    return d ? WEEKDAYS[d.getDay()] : '';
  }
  function relTime(iso) {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!t) return null;
    const diff = Math.max(0, Date.now() - t);
    const min = Math.floor(diff / 60000);
    if (min < 1) return '방금';
    if (min < 60) return `${min}분 전`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}시간 전`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}일 전`;
    return new Date(t).toLocaleDateString('ko-KR');
  }
  function toast(msg, kind = '', action = null) {
    const root = $('#toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `<span>${esc(msg)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', () => { action.fn(); el.remove(); });
      el.appendChild(b);
    }
    root.appendChild(el);
    setTimeout(() => el.remove(), action ? 6000 : 3200);
  }

  /* ---------- storage ---------- */
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)) : Object.assign({}, DEFAULT_SETTINGS);
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }
  function saveData(immediate) {
    clearTimeout(saveTimer);
    const write = () => {
      try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch (e) { toast('저장 공간이 부족해요', 'err'); }
    };
    if (immediate) write(); else saveTimer = setTimeout(write, 200);
  }
  function touch() {
    data.updatedAt = new Date().toISOString();
    saveData(true);
    render();
  }
  function normalize(obj) {
    const base = JSON.parse(JSON.stringify(DEFAULT_DATA));
    if (!obj || typeof obj !== 'object') return base;
    const out = {
      version: 2,
      updatedAt: obj.updatedAt || new Date().toISOString(),
      todos: Array.isArray(obj.todos) ? obj.todos : [],
      events: Array.isArray(obj.events) ? obj.events : [],
      experiences: Array.isArray(obj.experiences) ? obj.experiences : [],
      people: Array.isArray(obj.people) && obj.people.length ? obj.people : base.people,
      places: Array.isArray(obj.places) ? obj.places : base.places
    };
    out.todos = out.todos.map(t => ({
      id: t.id || uid('t'),
      title: String(t.title || ''),
      note: t.note || null,
      date: t.date || null,
      assignee: t.assignee || null,
      child: t.child || null,
      tags: Array.isArray(t.tags) ? t.tags : [],
      repeat: t.repeat || null,
      done: !!t.done
    }));
    out.events = out.events.map(e => ({
      id: e.id || uid('e'),
      title: String(e.title || ''),
      date: e.date || null,
      time: e.time || null,
      endTime: e.endTime || null,
      child: e.child || null,
      tags: Array.isArray(e.tags) ? e.tags : [],
      note: e.note || null
    }));
    out.experiences = out.experiences.map(x => ({
      id: x.id || uid('x'),
      title: String(x.title || ''),
      date: x.date || null,
      child: x.child || null,
      place: x.place || null,
      memo: x.memo || null
    }));
    out.people = out.people.map(p => ({
      id: p.id || uid('p'),
      name: String(p.name || ''),
      role: p.role || '',
      emoji: p.emoji || '🙂',
      memo: p.memo || ''
    }));
    out.places = out.places.map(p => ({
      id: p.id || uid('pl'),
      name: String(p.name || ''),
      memo: p.memo || ''
    }));
    return out;
  }
  async function seedData() {
    try {
      const res = await fetch('./data.json', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        return normalize(json);
      }
    } catch (e) { /* offline first run */ }
    return normalize(DEFAULT_DATA);
  }

  /* ---------- render ---------- */
  function render() {
    renderFilters();
    if (ui.tab === 'todos') { renderTodos(); renderEvents(); }
    else { renderExperiences(); }
    renderCounts();
    renderStatus();
  }

  function renderFilters() {
    $$('#child-filters [data-child]').forEach(b => b.classList.toggle('active', b.dataset.child === ui.child));
    $('#hide-done').setAttribute('aria-pressed', String(ui.hideDone));
    $$('#exp-filters [data-exp-child]').forEach(b => b.classList.toggle('active', b.dataset.expChild === ui.expChild));

    const list = TAGS;
    $('#tag-filters').innerHTML =
      `<button type="button" class="chip-filter tag ${ui.tag === null ? 'active' : ''}" data-tag="">전체 태그</button>` +
      list.map(t => `<button type="button" class="chip-filter tag ${ui.tag === t ? 'active' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
  }

  function visibleTodos() {
    return data.todos
      .filter(t => ui.child === '전체' || t.child === ui.child)
      .filter(t => !ui.tag || (t.tags || []).includes(ui.tag))
      .filter(t => !ui.hideDone || !t.done)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const da = parseDate(a.date), db = parseDate(b.date);
        if (da && db && da - db !== 0) return da - db;
        if (da && !db) return -1;
        if (!da && db) return 1;
        return (a.title || '').localeCompare(b.title || '');
      });
  }

  function renderTodos() {
    const rows = visibleTodos();
    const list = $('#todo-list');
    if (!rows.length) {
      const filtering = ui.child !== '전체' || ui.tag || ui.hideDone;
      list.innerHTML = `<div class="empty"><strong>${data.todos.length ? '조건에 맞는 할 일이 없어요' : '할 일이 아직 없어요'}</strong>${
        data.todos.length ? (filtering ? '필터를 바꾸거나 완료 숨기기를 꺼 보세요.' : '')
          : '오른쪽 아래 + 버튼으로 첫 할 일을 추가해 보세요.'}</div>`;
      return;
    }
    list.innerHTML = rows.map(t => {
      const cls = dueClass(t.date);
      return `<article class="todo ${t.done ? 'done' : ''}" data-id="${esc(t.id)}">
        <button type="button" class="check" role="checkbox" aria-checked="${t.done}" aria-label="완료 표시" data-act="toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="#06231d" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6.5"/></svg>
        </button>
        <div class="todo-main">
          <div class="todo-title">${esc(t.title)}</div>
          ${t.note ? `<div class="todo-note">${esc(t.note)}</div>` : ''}
          <div class="todo-meta">
            ${t.date ? `<span class="due ${cls}">${fmtMD(t.date)}</span>` : '<span class="due">날짜 없음</span>'}
            ${t.assignee ? `<span class="assignee">→ ${esc(t.assignee)}</span>` : ''}
            ${t.child ? `<span class="badge kid-${esc(t.child)}">${esc(t.child)}</span>` : ''}
            ${(t.tags || []).map(tag => `<span class="badge tag">${esc(tag)}</span>`).join('')}
            ${t.repeat ? `<span class="badge repeat">↻ ${esc(t.repeat)}</span>` : ''}
          </div>
        </div>
        <div class="todo-actions">
          <button type="button" class="icon-btn" data-act="edit" aria-label="수정">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5 17.5 10.5"/></svg>
          </button>
          <button type="button" class="icon-btn danger" data-act="delete" aria-label="삭제">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/></svg>
          </button>
        </div>
      </article>`;
    }).join('');
  }

  function upcomingEvents() {
    const today = parseDate(todayISO());
    return data.events
      .filter(e => {
        const d = parseDate(e.date);
        return d ? d >= today : true;
      })
      .sort((a, b) => (parseDate(a.date) || 0) - (parseDate(b.date) || 0));
  }

  function renderEvents() {
    const rows = upcomingEvents();
    $('#event-count').textContent = '· ' + rows.length;
    const list = $('#event-list');
    if (!rows.length) {
      list.innerHTML = `<div class="empty" style="padding:22px 24px">다가오는 일정이 없어요.<br>+ 버튼 → 새 일정으로 등록할 수 있어요.</div>`;
      return;
    }
    list.innerHTML = rows.map(e => {
      const d = parseDate(e.date);
      const when = [fmtMD(e.date), weekday(e.date)].filter(Boolean).join(' ') +
        (e.time ? ' · ' + e.time + (e.endTime ? '–' + e.endTime : '') : '');
      return `<article class="event" data-id="${esc(e.id)}">
        <div class="event-date"><span class="d">${d ? String(d.getDate()).padStart(2, '0') : '--'}</span><span class="m">${d ? (d.getMonth() + 1) + '월' : ''}</span></div>
        <div class="event-main">
          <div class="event-title">${esc(e.title)}</div>
          <div class="event-when">${esc(when)}</div>
          ${(e.child || (e.tags || []).length) ? `<div class="event-meta">
            ${e.child ? `<span class="badge kid-${esc(e.child)}">${esc(e.child)}</span>` : ''}
            ${(e.tags || []).map(t => `<span class="badge tag">${esc(t)}</span>`).join('')}
          </div>` : ''}
          ${e.note ? `<div class="event-note">${esc(e.note)}</div>` : ''}
        </div>
        <div class="todo-actions">
          <button type="button" class="icon-btn" data-act="edit" aria-label="수정">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5 17.5 10.5"/></svg>
          </button>
          <button type="button" class="icon-btn danger" data-act="delete" aria-label="삭제">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/></svg>
          </button>
        </div>
      </article>`;
    }).join('');
  }

  function renderExperiences() {
    const rows = data.experiences
      .filter(x => ui.expChild === '전체' || x.child === ui.expChild)
      .sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0));
    const list = $('#exp-list');
    if (!rows.length) {
      list.innerHTML = `<div class="empty"><strong>경험 기록이 아직 없어요</strong>다녀온 곳, 진료, 성장 메모를 남겨 두면<br>나중에 아이와 다시 꺼내 볼 수 있어요.</div>`;
      return;
    }
    list.innerHTML = rows.map(x => `<article class="exp-item" data-id="${esc(x.id)}">
      <div class="exp-date">${fmtMD(x.date) || '—'}</div>
      <div class="exp-main">
        <div class="exp-title">${esc(x.title)}</div>
        <div class="exp-place">${[x.child, x.place].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div>
        ${x.memo ? `<div class="exp-memo">${esc(x.memo)}</div>` : ''}
      </div>
      <div class="todo-actions">
        <button type="button" class="icon-btn" data-act="edit" aria-label="수정">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5 17.5 10.5"/></svg>
        </button>
        <button type="button" class="icon-btn danger" data-act="delete" aria-label="삭제">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/></svg>
        </button>
      </div>
    </article>`).join('');
  }

  function renderCounts() {
    const open = data.todos.filter(t => !t.done).length;
    $('#count-todos').textContent = open;
    $('#count-exp').textContent = data.experiences.length;
  }

  function localChanged() {
    if (!settings.lastSyncAt) return true;
    return Date.parse(data.updatedAt || 0) > Date.parse(settings.lastSyncAt);
  }

  function renderStatus() {
    $('#status-local').textContent = '로컬 저장';
    $('#status-local').className = 'chip ok';

    const hasToken = !!localStorage.getItem(TOKEN_KEY);
    const gh = $('#status-gh');
    gh.textContent = hasToken ? 'GitHub 연결됨' : 'GitHub 미연결';
    gh.className = 'chip ' + (hasToken ? 'ok' : '');

    const rel = relTime(settings.lastSyncAt);
    $('#status-synced').textContent = rel ? `동기화 ${rel}` : '동기화 기록 없음';
    $('#status-synced').className = 'chip ' + (rel ? '' : 'warn');

    $('#btn-sync').classList.toggle('is-dirty', !!hasToken && localChanged());
  }

  /* ---------- modal ---------- */
  const modalRoot = $('#modal-root');
  const sheet = $('#sheet');

  function openSheet(html) {
    sheet.innerHTML = `<div class="sheet-grip" aria-hidden="true"></div>` + html;
    modalRoot.hidden = false;
    document.body.style.overflow = 'hidden';
    sheet.scrollTop = 0;
    const first = sheet.querySelector('input, textarea, select');
    if (first && window.innerWidth > 700) first.focus();
  }
  function closeSheet() {
    modalRoot.hidden = true;
    sheet.innerHTML = '';
    document.body.style.overflow = '';
  }
  $('#backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalRoot.hidden) closeSheet();
  });
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeSheet();
  });

  const closeBtn = `<button type="button" class="close-x" data-close aria-label="닫기">✕</button>`;

  function segButtons(options, current, extra = '') {
    return options.map(o => `<button type="button" class="${o.value === current ? 'active' : ''}" data-val="${esc(o.value)}">${esc(o.label)}</button>`).join('');
  }

  /* ---------- editors ---------- */
  function openTodoEditor(id) {
    const item = id ? data.todos.find(t => t.id === id) : null;
    const draft = item ? Object.assign({}, item) : {
      title: '', note: '', date: todayISO(), assignee: '', child: ui.child !== '전체' ? ui.child : '', tags: [], repeat: ''
    };
    const tags = new Set(draft.tags || []);
    openSheet(`
      <div class="sheet-head">
        <div><h2 id="sheet-title">${item ? '할 일 수정' : '새 할 일'}</h2>
        <p class="sheet-sub">${item ? '내용을 고치고 저장하세요.' : '아이별 할 일과 준비물을 적어 두세요.'}</p></div>
        ${closeBtn}
      </div>
      <form id="f-todo">
        <div class="field"><label for="f-title">할 일</label>
          <input id="f-title" type="text" value="${esc(draft.title)}" placeholder="예) 지우 준비물 챙기기" autocomplete="off" required /></div>
        <div class="field"><label for="f-note">메모 · 준비물</label>
          <textarea id="f-note" placeholder="예) 09:40 도보, 편한 복장·이불">${esc(draft.note || '')}</textarea></div>
        <div class="field-row">
          <div class="field"><label for="f-date">마감일</label>
            <input id="f-date" type="date" value="${esc(draft.date || '')}" /></div>
          <div class="field"><label for="f-repeat">반복</label>
            <select id="f-repeat">${REPEATS.map(r => `<option value="${esc(r)}" ${r === (draft.repeat || '') ? 'selected' : ''}>${r || '반복 없음'}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>담당</label>
          <div class="seg" id="f-assignee">${segButtons([{ value: '', label: '없음' }, ...OWNERS.map(o => ({ value: o, label: o }))], draft.assignee || '')}</div></div>
        <div class="field"><label>아이</label>
          <div class="seg" id="f-child">${segButtons([{ value: '', label: '없음' }, ...KIDS.map(k => ({ value: k, label: k }))], draft.child || '')}</div></div>
        <div class="field"><label>태그</label>
          <div class="seg tags" id="f-tags">${TAGS.map(t => `<button type="button" class="${tags.has(t) ? 'active' : ''}" data-val="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
        <div class="btn-row" style="margin-top:16px">
          <button type="button" class="btn ghost" data-close>취소</button>
          <button type="submit" class="btn primary">저장</button>
        </div>
      </form>
    `);

    bindSeg('#f-assignee', false);
    bindSeg('#f-child', false);
    bindSeg('#f-tags', true);

    $('#f-todo').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = $('#f-title').value.trim();
      if (!title) { toast('할 일 제목을 적어 주세요', 'err'); $('#f-title').focus(); return; }
      const payload = {
        title,
        note: $('#f-note').value.trim() || null,
        date: $('#f-date').value || null,
        repeat: $('#f-repeat').value || null,
        assignee: activeVal('#f-assignee', true) || null,
        child: activeVal('#f-child', true) || null,
        tags: activeVals('#f-tags')
      };
      if (item) Object.assign(item, payload);
      else data.todos.push(Object.assign({ id: uid('t'), done: false }, payload));
      touch();
      closeSheet();
      toast(item ? '할 일을 고쳤어요' : '할 일을 추가했어요', 'ok');
    });
  }

  function openEventEditor(id) {
    const item = id ? data.events.find(e => e.id === id) : null;
    const draft = item ? Object.assign({}, item) : { title: '', date: todayISO(), time: '', endTime: '', child: '', tags: [], note: '' };
    const tags = new Set(draft.tags || []);
    openSheet(`
      <div class="sheet-head">
        <div><h2 id="sheet-title">${item ? '일정 수정' : '새 일정'}</h2>
        <p class="sheet-sub">생일파티, 행사, 병원 예약처럼 날짜가 정해진 일정.</p></div>
        ${closeBtn}
      </div>
      <form id="f-event">
        <div class="field"><label for="f-e-title">일정</label>
          <input id="f-e-title" type="text" value="${esc(draft.title)}" placeholder="예) 지우 11월 생일파티" autocomplete="off" required /></div>
        <div class="field-row">
          <div class="field"><label for="f-e-date">날짜</label><input id="f-e-date" type="date" value="${esc(draft.date || '')}" /></div>
          <div class="field"><label for="f-e-time">시작</label><input id="f-e-time" type="time" value="${esc(draft.time || '')}" /></div>
          <div class="field"><label for="f-e-end">종료</label><input id="f-e-end" type="time" value="${esc(draft.endTime || '')}" /></div>
        </div>
        <div class="field"><label>아이</label>
          <div class="seg" id="f-e-child">${segButtons([{ value: '', label: '없음' }, ...KIDS.map(k => ({ value: k, label: k }))], draft.child || '')}</div></div>
        <div class="field"><label>태그</label>
          <div class="seg tags" id="f-e-tags">${TAGS.map(t => `<button type="button" class="${tags.has(t) ? 'active' : ''}" data-val="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
        <div class="field"><label for="f-e-note">준비물 · 메모</label>
          <textarea id="f-e-note" placeholder="예) 선생님께 인사, 과일 도시락">${esc(draft.note || '')}</textarea></div>
        <div class="btn-row" style="margin-top:16px">
          <button type="button" class="btn ghost" data-close>취소</button>
          <button type="submit" class="btn primary">저장</button>
        </div>
      </form>
    `);
    bindSeg('#f-e-child', false);
    bindSeg('#f-e-tags', true);
    $('#f-event').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = $('#f-e-title').value.trim();
      if (!title) { toast('일정 이름을 적어 주세요', 'err'); return; }
      const payload = {
        title,
        date: $('#f-e-date').value || null,
        time: $('#f-e-time').value || null,
        endTime: $('#f-e-end').value || null,
        child: activeVal('#f-e-child', true) || null,
        tags: activeVals('#f-e-tags'),
        note: $('#f-e-note').value.trim() || null
      };
      if (item) Object.assign(item, payload);
      else data.events.push(Object.assign({ id: uid('e') }, payload));
      touch();
      closeSheet();
      toast(item ? '일정을 고쳤어요' : '일정을 추가했어요', 'ok');
    });
  }

  function openExperienceEditor(id) {
    const item = id ? data.experiences.find(x => x.id === id) : null;
    const draft = item ? Object.assign({}, item) : { title: '', date: todayISO(), child: '', place: '', memo: '' };
    openSheet(`
      <div class="sheet-head">
        <div><h2 id="sheet-title">${item ? '경험 기록 수정' : '새 경험 기록'}</h2>
        <p class="sheet-sub">다녀온 곳, 진료, 성장 메모를 한 줄로 남겨 두세요.</p></div>
        ${closeBtn}
      </div>
      <form id="f-exp">
        <div class="field"><label for="f-x-title">제목</label>
          <input id="f-x-title" type="text" value="${esc(draft.title)}" placeholder="예) 첫 동물원 나들이" autocomplete="off" required /></div>
        <div class="field-row">
          <div class="field"><label for="f-x-date">날짜</label><input id="f-x-date" type="date" value="${esc(draft.date || '')}" /></div>
          <div class="field"><label for="f-x-place">장소</label><input id="f-x-place" type="text" value="${esc(draft.place || '')}" placeholder="예) 서울대공원" /></div>
        </div>
        <div class="field"><label>아이</label>
          <div class="seg" id="f-x-child">${segButtons([{ value: '', label: '없음' }, ...KIDS.map(k => ({ value: k, label: k }))], draft.child || '')}</div></div>
        <div class="field"><label for="f-x-memo">한줄 메모</label>
          <textarea id="f-x-memo" placeholder="예) 기린 보자마자 손 흔들었다">${esc(draft.memo || '')}</textarea></div>
        <div class="btn-row" style="margin-top:16px">
          <button type="button" class="btn ghost" data-close>취소</button>
          <button type="submit" class="btn primary">저장</button>
        </div>
      </form>
    `);
    bindSeg('#f-x-child', false);
    $('#f-exp').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = $('#f-x-title').value.trim();
      if (!title) { toast('제목을 적어 주세요', 'err'); return; }
      const payload = {
        title,
        date: $('#f-x-date').value || null,
        place: $('#f-x-place').value.trim() || null,
        child: activeVal('#f-x-child', true) || null,
        memo: $('#f-x-memo').value.trim() || null
      };
      if (item) Object.assign(item, payload);
      else data.experiences.push(Object.assign({ id: uid('x') }, payload));
      touch();
      if (ui.tab !== 'exp') switchTab('exp');
      closeSheet();
      toast(item ? '기록을 고쳤어요' : '경험을 기록했어요', 'ok');
    });
  }

  function bindSeg(sel, multi) {
    const root = $(sel);
    if (!root) return;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-val]');
      if (!b) return;
      if (multi) b.classList.toggle('active');
      else {
        $$('button', root).forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      }
    });
  }
  function activeVal(sel, allowEmpty) {
    const b = $(`${sel} button.active`);
    return b ? b.dataset.val : (allowEmpty ? '' : null);
  }
  function activeVals(sel) {
    return $$(`${sel} button.active`).map(b => b.dataset.val);
  }

  /* ---------- people / places ---------- */
  function openPeople() {
    openSheet(`
      <div class="sheet-head">
        <div><h2 id="sheet-title">사람</h2><p class="sheet-sub">우리 집 가족 메모. 이름을 눌러 메모를 고칠 수 있어요.</p></div>
        ${closeBtn}
      </div>
      <div>${data.people.map(p => `
        <div class="person" data-id="${esc(p.id)}">
          <div class="avatar" aria-hidden="true">${esc(p.emoji)}</div>
          <div class="person-main">
            <div class="person-name">${esc(p.name)}</div>
            <div class="person-role">${esc(p.role)}</div>
            <div class="person-memo ${p.memo ? '' : 'empty-memo'}">${p.memo ? esc(p.memo) : '메모 없음'}</div>
          </div>
          <div class="todo-actions">
            <button type="button" class="icon-btn" data-act="person-edit" aria-label="${esc(p.name)} 메모 수정">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5 17.5 10.5"/></svg>
            </button>
          </div>
        </div>`).join('')}</div>
      <p class="desc" style="font-size:11.5px;color:var(--faint);margin-top:14px">가족 호칭만 저장합니다. 연락처·주소 같은 정보는 넣지 않아요.</p>
    `);
    $$('#sheet .person').forEach(row => {
      row.querySelector('[data-act="person-edit"]').addEventListener('click', () => {
        const p = data.people.find(x => x.id === row.dataset.id);
        openPersonEditor(p);
      });
    });
  }

  function openPersonEditor(p) {
    openSheet(`
      <div class="sheet-head">
        <div><h2 id="sheet-title">${esc(p.name)}</h2><p class="sheet-sub">${esc(p.role)}</p></div>
        ${closeBtn}
      </div>
      <form id="f-person">
        <div class="field"><label for="f-p-memo">메모</label>
          <textarea id="f-p-memo" placeholder="좋아하는 것, 알레르기, 생활 리듬 등">${esc(p.memo || '')}</textarea></div>
        <div class="btn-row" style="margin-top:14px">
          <button type="button" class="btn ghost" data-close>취소</button>
          <button type="submit" class="btn primary">저장</button>
        </div>
      </form>
    `);
    $('#f-person').addEventListener('submit', (e) => {
      e.preventDefault();
      p.memo = $('#f-p-memo').value.trim();
      touch();
      closeSheet();
      openPeople();
      toast('메모를 저장했어요', 'ok');
    });
  }

  function openPlaces() {
    openSheet(`
      <div class="sheet-head">
        <div><h2 id="sheet-title">장소</h2><p class="sheet-sub">자주 가는 곳과 준비물 메모. 주소는 저장하지 않아요.</p></div>
        ${closeBtn}
      </div>
      <div>${data.places.length ? data.places.map(p => `
        <div class="place" data-id="${esc(p.id)}">
          <div class="avatar" aria-hidden="true">📍</div>
          <div class="place-main">
            <div class="place-name">${esc(p.name)}</div>
            <div class="place-memo">${p.memo ? esc(p.memo) : '<span style="opacity:.6">메모 없음</span>'}</div>
          </div>
          <div class="todo-actions">
            <button type="button" class="icon-btn" data-act="place-edit" aria-label="수정">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5 17.5 10.5"/></svg>
            </button>
            <button type="button" class="icon-btn danger" data-act="place-del" aria-label="삭제">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>
            </button>
          </div>
        </div>`).join('') : `<div class="empty">저장한 장소가 없어요.</div>`}</div>
      <button type="button" class="btn primary" id="place-add" style="margin-top:14px">+ 장소 추가</button>
    `);
    $('#place-add').addEventListener('click', () => openPlaceEditor(null));
    $$('#sheet .place').forEach(row => {
      const p = data.places.find(x => x.id === row.dataset.id);
      row.querySelector('[data-act="place-edit"]').addEventListener('click', () => openPlaceEditor(p));
      row.querySelector('[data-act="place-del"]').addEventListener('click', () => {
        data.places = data.places.filter(x => x.id !== p.id);
        touch();
        openPlaces();
        toast('장소를 지웠어요');
      });
    });
  }

  function openPlaceEditor(p) {
    openSheet(`
      <div class="sheet-head">
        <div><h2 id="sheet-title">${p ? '장소 수정' : '새 장소'}</h2><p class="sheet-sub">이름과 메모만 저장합니다.</p></div>
        ${closeBtn}
      </div>
      <form id="f-place">
        <div class="field"><label for="f-pl-name">이름</label>
          <input id="f-pl-name" type="text" value="${esc(p ? p.name : '')}" placeholder="예) 소아과" required /></div>
        <div class="field"><label for="f-pl-memo">메모</label>
          <textarea id="f-pl-memo" placeholder="예) 예방접종 수첩 챙기기">${esc(p ? (p.memo || '') : '')}</textarea></div>
        <div class="btn-row" style="margin-top:14px">
          <button type="button" class="btn ghost" data-close>취소</button>
          <button type="submit" class="btn primary">저장</button>
        </div>
      </form>
    `);
    $('#f-place').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#f-pl-name').value.trim();
      if (!name) { toast('장소 이름을 적어 주세요', 'err'); return; }
      const memo = $('#f-pl-memo').value.trim();
      if (p) { p.name = name; p.memo = memo; }
      else data.places.push({ id: uid('pl'), name, memo });
      touch();
      closeSheet();
      openPlaces();
      toast('장소를 저장했어요', 'ok');
    });
  }

  /* ---------- settings ---------- */
  function openSettings(section) {
    const tokenSaved = !!localStorage.getItem(TOKEN_KEY);
    openSheet(`
      <div class="sheet-head">
        <div><h2 id="sheet-title">설정</h2><p class="sheet-sub">데이터는 이 브라우저에 자동 저장되고, GitHub로 가족과 맞출 수 있어요.</p></div>
        ${closeBtn}
      </div>

      <div class="field"><label>화면 테마</label>
        <div class="seg" id="s-theme">
          <button type="button" data-val="dark" class="${settings.theme === 'dark' ? 'active' : ''}">다크</button>
          <button type="button" data-val="light" class="${settings.theme === 'light' ? 'active' : ''}">라이트</button>
        </div>
      </div>

      <div class="block">
        <h3>JSON 내보내기 · 가져오기</h3>
        <p class="desc">가족 데이터 전체를 파일이나 클립보드로 옮길 수 있어요. 동기화 토큰은 포함되지 않습니다.</p>
        <div class="btn-row">
          <button type="button" class="btn" id="s-export">파일로 내보내기</button>
          <button type="button" class="btn" id="s-copy">클립보드 복사</button>
        </div>
        <div class="btn-row" style="margin-top:9px">
          <button type="button" class="btn ghost" id="s-import-file">파일에서 가져오기</button>
          <button type="button" class="btn ghost" id="s-import-text">붙여넣기로 가져오기</button>
        </div>
        <input type="file" id="s-file" accept="application/json,.json" hidden />
      </div>

      <div class="block" id="sync-block">
        <h3>GitHub 동기화</h3>
        <p class="desc">비공개 저장소의 <b>data.json</b> 한 파일로 루나(피클)·맥미니(무봇)와 같은 데이터를 주고받습니다. 토큰은 이 브라우저 localStorage에만 저장되고 내보내기 파일에는 들어가지 않아요.</p>
        <div class="field"><label for="s-repo">저장소 (owner/repo)</label>
          <input id="s-repo" type="text" value="${esc(settings.repo)}" autocomplete="off" spellcheck="false" /></div>
        <div class="field-row">
          <div class="field"><label for="s-branch">브랜치</label>
            <input id="s-branch" type="text" value="${esc(settings.branch)}" autocomplete="off" spellcheck="false" /></div>
          <div class="field"><label for="s-path">파일 경로</label>
            <input id="s-path" type="text" value="${esc(settings.path)}" autocomplete="off" spellcheck="false" /></div>
        </div>
        <div class="field"><label for="s-pat">Personal Access Token</label>
          <input id="s-pat" type="password" placeholder="${tokenSaved ? '저장됨 · 바꿀 때만 입력' : 'ghp_... 또는 github_pat_...'}" autocomplete="off" spellcheck="false" />
          <div class="hint">이 저장소에만 Contents(read/write) 권한을 준 fine-grained 토큰을 권장합니다. 값은 다시 화면에 표시되지 않아요.</div>
        </div>
        <div class="kv"><span>마지막 동기화</span><b>${settings.lastSyncAt ? esc(relTime(settings.lastSyncAt)) + ' · ' + esc(new Date(settings.lastSyncAt).toLocaleString('ko-KR')) : '없음'}</b></div>
        <div class="kv"><span>이 기기 변경</span><b>${localChanged() ? '동기화 필요' : '최신'}</b></div>
        <div class="btn-row" style="margin-top:11px">
          <button type="button" class="btn" id="s-test">연결 확인</button>
          <button type="button" class="btn mint" id="s-sync-now">지금 동기화</button>
        </div>
        <div class="btn-row" style="margin-top:9px">
          <button type="button" class="btn ghost" id="s-pull">GitHub에서 불러오기</button>
          <button type="button" class="btn ghost" id="s-push">GitHub에 올리기</button>
        </div>
        <button type="button" class="btn ghost" id="s-token-clear" style="margin-top:9px;font-size:12.5px;color:var(--faint)">이 기기에서 토큰 삭제</button>
      </div>

      <div class="block">
        <h3>데이터</h3>
        <div class="kv"><span>할 일</span><b>${data.todos.length}개 (완료 ${data.todos.filter(t => t.done).length})</b></div>
        <div class="kv"><span>일정 / 경험</span><b>${data.events.length} / ${data.experiences.length}</b></div>
        <div class="kv"><span>마지막 수정</span><b>${esc(new Date(data.updatedAt).toLocaleString('ko-KR'))}</b></div>
        <button type="button" class="btn danger" id="s-reset" style="margin-top:11px">이 기기 데이터 초기화</button>
      </div>

      <p class="desc" style="text-align:center;margin-top:16px;font-size:11px">우리 집 Kid Hub v${VERSION}</p>
    `);

    // theme
    $('#s-theme').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-val]');
      if (!b) return;
      $$('#s-theme button').forEach(x => x.classList.toggle('active', x === b));
      settings.theme = b.dataset.val;
      saveSettings();
      applyTheme();
    });

    // export / import
    $('#s-export').addEventListener('click', exportFile);
    $('#s-copy').addEventListener('click', copyJSON);
    $('#s-import-file').addEventListener('click', () => $('#s-file').click());
    $('#s-file').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        importJSON(text);
      } catch (err) {
        toast('파일을 읽지 못했어요', 'err');
      }
      e.target.value = '';
    });
    $('#s-import-text').addEventListener('click', openImportText);

    // sync config
    $('#s-repo').addEventListener('change', (e) => { settings.repo = e.target.value.trim(); saveSettings(); });
    $('#s-branch').addEventListener('change', (e) => { settings.branch = e.target.value.trim(); saveSettings(); });
    $('#s-path').addEventListener('change', (e) => { settings.path = e.target.value.trim(); saveSettings(); });
    $('#s-pat').addEventListener('change', (e) => {
      const v = e.target.value.trim();
      if (v) {
        localStorage.setItem(TOKEN_KEY, v);
        e.target.value = '';
        e.target.placeholder = '저장됨 · 바꿀 때만 입력';
        toast('토큰을 이 기기에 저장했어요', 'ok');
        renderStatus();
      }
    });
    $('#s-token-clear').addEventListener('click', () => {
      localStorage.removeItem(TOKEN_KEY);
      $('#s-pat').placeholder = 'ghp_... 또는 github_pat_...';
      toast('토큰을 삭제했어요');
      renderStatus();
      closeSheet();
    });

    $('#s-test').addEventListener('click', async () => {
      if (!ghToken()) { toast('토큰을 먼저 입력해 주세요', 'err'); return; }
      try {
        const r = await ghGetFile();
        toast(r.missing ? '연결됐지만 data.json이 아직 없어요 (동기화 시 생성)' : `연결됐어요 · 원격 최종 수정 ${new Date(r.json.updatedAt || 0).toLocaleString('ko-KR')}`, 'ok');
      } catch (err) {
        toast(err.message || '연결에 실패했어요', 'err');
      }
    });
    $('#s-sync-now').addEventListener('click', async () => {
      await syncNow();
      if (modalRoot.hidden) return;
      openSettings('sync');
    });
    $('#s-pull').addEventListener('click', async () => {
      try {
        if (localChanged() && settings.lastSyncAt) {
          const ok = await confirmSheet('GitHub 데이터로 덮어쓸까요?', '이 기기에서 아직 올리지 않은 변경이 있어요. 원격 내용을 불러오면 사라집니다.', '불러오기', '취소');
          if (!ok) return;
        }
        await pullNow();
      } catch (err) { toast(err.message || '불러오지 못했어요', 'err'); }
    });
    $('#s-push').addEventListener('click', async () => {
      try { await pushNow(); } catch (err) { toast(err.message || '올리지 못했어요', 'err'); }
    });
    $('#s-reset').addEventListener('click', async () => {
      const ok = await confirmSheet('이 기기 데이터를 초기화할까요?', 'localStorage의 Kid Hub 데이터를 지우고 초기 상태로 돌립니다. GitHub의 data.json은 그대로 남아요.', '초기화', '취소');
      if (!ok) return;
      localStorage.removeItem(DATA_KEY);
      data = normalize(DEFAULT_DATA);
      touch();
      closeSheet();
      toast('이 기기 데이터를 초기화했어요', 'ok');
    });

    if (section === 'sync') {
      setTimeout(() => {
        const el = $('#sync-block');
        if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        const repo = $('#s-repo');
        if (repo) repo.focus();
      }, 120);
    }
  }

  function confirmSheet(title, body, okLabel, cancelLabel) {
    return new Promise((resolve) => {
      openSheet(`
        <div class="sheet-head"><div><h2 id="sheet-title">${esc(title)}</h2>
          <p class="sheet-sub">${esc(body)}</p></div>${closeBtn}</div>
        <div class="btn-row" style="margin-top:14px">
          <button type="button" class="btn ghost" id="cf-no">${esc(cancelLabel || '취소')}</button>
          <button type="button" class="btn primary" id="cf-yes">${esc(okLabel || '확인')}</button>
        </div>
      `);
      const done = (v) => { closeSheet(); resolve(v); };
      $('#cf-yes').addEventListener('click', () => done(true));
      $('#cf-no').addEventListener('click', () => done(false));
      $('#backdrop').addEventListener('click', () => resolve(false), { once: true });
    });
  }

  function openImportText() {
    openSheet(`
      <div class="sheet-head"><div><h2 id="sheet-title">붙여넣기로 가져오기</h2>
        <p class="sheet-sub">내보낸 JSON 전체를 붙여넣으세요. 기존 데이터를 대체합니다.</p></div>${closeBtn}</div>
      <div class="field"><label for="imp-text">JSON</label>
        <textarea id="imp-text" style="min-height:160px" placeholder='{"todos":[...]}'></textarea></div>
      <div class="btn-row"><button type="button" class="btn ghost" data-close>취소</button>
        <button type="button" class="btn primary" id="imp-go">가져오기</button></div>
    `);
    $('#imp-go').addEventListener('click', () => importJSON($('#imp-text').value));
  }

  function importJSON(text) {
    let json;
    try { json = JSON.parse(text); } catch (e) { toast('JSON 형식이 올바르지 않아요', 'err'); return; }
    if (!json || typeof json !== 'object' || !(Array.isArray(json.todos) || Array.isArray(json.events) || Array.isArray(json.experiences))) {
      toast('Kid Hub 데이터가 아닌 것 같아요', 'err');
      return;
    }
    confirmSheet('가져올까요?', '지금 이 기기의 할 일·일정·경험이 가져온 데이터로 바뀝니다.', '가져오기', '취소').then((ok) => {
      if (!ok) return;
      data = normalize(json);
      data.updatedAt = new Date().toISOString();
      saveData(true);
      render();
      closeSheet();
      toast('가져왔어요', 'ok');
    });
  }

  function exportFile() {
    const payload = Object.assign({}, data, { exportedAt: new Date().toISOString(), app: 'kid-hub', version: 2 });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kid-hub-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('JSON 파일을 내려받았어요', 'ok');
  }

  async function copyJSON() {
    const text = JSON.stringify(data, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast('클립보드에 복사했어요', 'ok');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      toast(ok ? '클립보드에 복사했어요' : '복사에 실패했어요. 파일로 내보내기를 써 주세요', ok ? 'ok' : 'err');
    }
  }

  /* ---------- GitHub sync ---------- */
  function ghToken() { return localStorage.getItem(TOKEN_KEY) || ''; }

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob((b64 || '').replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function ghError(res) {
    let msg = `GitHub 오류 ${res.status}`;
    try {
      const j = await res.json();
      if (j && j.message) msg += ` · ${j.message}`;
    } catch (e) {}
    if (res.status === 401) msg = '토큰이 올바르지 않아요. 설정에서 다시 확인해 주세요.';
    if (res.status === 403) msg = '권한이 없어요. 토큰에 Contents 읽기/쓰기 권한이 있는지 확인해 주세요.';
    if (res.status === 404) msg = '저장소나 브랜치를 찾을 수 없어요. owner/repo와 브랜치를 확인해 주세요.';
    return new Error(msg);
  }

  function ghUrl() {
    const [owner, repo] = (settings.repo || '').split('/');
    if (!owner || !repo) throw new Error('저장소를 owner/repo 형식으로 입력해 주세요');
    const path = (settings.path || 'data.json').split('/').map(encodeURIComponent).join('/');
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
  }
  function ghHeaders() {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${ghToken()}`,
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  async function ghGetFile() {
    const res = await fetch(`${ghUrl()}?ref=${encodeURIComponent(settings.branch)}`, {
      headers: ghHeaders(), cache: 'no-store'
    });
    if (res.status === 404) return { missing: true };
    if (!res.ok) throw await ghError(res);
    const j = await res.json();
    if (!j.content) throw new Error('원격 파일을 읽지 못했어요');
    let json;
    try { json = JSON.parse(b64decode(j.content)); } catch (e) { throw new Error('원격 data.json 형식이 올바르지 않아요'); }
    return { sha: j.sha, json };
  }

  async function ghPutFile(sha) {
    data.updatedAt = new Date().toISOString();
    saveData(true);
    const body = {
      message: `kid-hub: 가족 데이터 동기화 (${new Date().toLocaleString('ko-KR')})`,
      content: b64encode(JSON.stringify(data, null, 2)),
      branch: settings.branch
    };
    if (sha) body.sha = sha;
    const res = await fetch(ghUrl(), {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw await ghError(res);
    return res.json();
  }

  function markSynced(sha) {
    settings.lastSyncAt = new Date().toISOString();
    if (sha) settings.lastSyncSha = sha;
    saveSettings();
    renderStatus();
  }

  function applyRemote(json) {
    const incoming = normalize(json);
    // 상대 기기 시계가 앞서 있어도 미래 시각이 남지 않게 보정
    if (Date.parse(incoming.updatedAt) > Date.now() + 1000) incoming.updatedAt = new Date().toISOString();
    data = incoming;
    saveData(true);
    render();
  }

  async function pullNow() {
    const r = await ghGetFile();
    if (r.missing) throw new Error('GitHub에 data.json이 아직 없어요. 먼저 올려 주세요.');
    applyRemote(r.json);
    markSynced(r.sha);
    toast('GitHub에서 불러왔어요', 'ok');
  }

  async function pushNow() {
    const r = await ghGetFile();
    const put = await ghPutFile(r.missing ? null : r.sha);
    markSynced(put && put.content ? put.content.sha : null);
    render();
    toast('GitHub에 올렸어요', 'ok');
  }

  async function syncNow() {
    if (syncing) return;
    if (!ghToken()) {
      openSettings('sync');
      toast('먼저 GitHub 토큰을 등록해 주세요', 'err');
      return;
    }
    syncing = true;
    const btn = $('#btn-sync');
    btn.classList.add('is-busy');
    try {
      const remote = await ghGetFile();
      if (remote.missing) {
        const put = await ghPutFile(null);
        markSynced(put && put.content ? put.content.sha : null);
        render();
        toast('GitHub에 data.json을 새로 만들었어요', 'ok');
        return;
      }
      const localAt = Date.parse(data.updatedAt || 0) || 0;
      const remoteAt = Date.parse(remote.json.updatedAt || 0) || 0;
      const lastAt = settings.lastSyncAt ? Date.parse(settings.lastSyncAt) : 0;

      if (!lastAt) {
        if (remoteAt > localAt) { applyRemote(remote.json); markSynced(remote.sha); toast('GitHub에서 불러왔어요', 'ok'); }
        else if (localAt > remoteAt) {
          const put = await ghPutFile(remote.sha);
          markSynced(put && put.content ? put.content.sha : null);
          render(); toast('GitHub에 올렸어요', 'ok');
        } else { markSynced(remote.sha); toast('이미 최신 상태예요', 'ok'); }
        return;
      }

      const localDirty = localAt > lastAt;
      // 원격 변경은 파일 SHA로 판단(기기 간 시계 차이에 영향받지 않음)
      const remoteDirty = settings.lastSyncSha ? remote.sha !== settings.lastSyncSha : remoteAt > lastAt;

      if (localDirty && remoteDirty) {
        const choice = await conflictSheet(remoteAt, localAt);
        if (choice === 'remote') { applyRemote(remote.json); markSynced(remote.sha); toast('GitHub 내용으로 맞췄어요', 'ok'); }
        else if (choice === 'local') {
          const put = await ghPutFile(remote.sha);
          markSynced(put && put.content ? put.content.sha : null);
          render(); toast('이 기기 내용을 올렸어요', 'ok');
        } else toast('동기화를 취소했어요');
        return;
      }
      if (remoteDirty) { applyRemote(remote.json); markSynced(remote.sha); toast('GitHub에서 불러왔어요', 'ok'); }
      else if (localDirty) {
        const put = await ghPutFile(remote.sha);
        markSynced(put && put.content ? put.content.sha : null);
        render(); toast('GitHub에 올렸어요', 'ok');
      }
      else { markSynced(remote.sha); toast('이미 최신 상태예요', 'ok'); }
    } catch (err) {
      toast(err.message || '동기화에 실패했어요', 'err');
    } finally {
      syncing = false;
      btn.classList.remove('is-busy');
      renderStatus();
    }
  }

  function conflictSheet(remoteAt, localAt) {
    return new Promise((resolve) => {
      openSheet(`
        <div class="sheet-head"><div><h2 id="sheet-title">양쪽 모두 바뀌었어요</h2>
          <p class="sheet-sub">이 기기와 GitHub 데이터가 각각 수정됐습니다. 어느 쪽을 남길지 골라 주세요.</p></div>${closeBtn}</div>
        <div class="kv"><span>GitHub 최종 수정</span><b>${esc(new Date(remoteAt).toLocaleString('ko-KR'))}</b></div>
        <div class="kv"><span>이 기기 최종 수정</span><b>${esc(new Date(localAt).toLocaleString('ko-KR'))}</b></div>
        <div class="actions" style="margin-top:14px">
          <button type="button" class="action-item" id="cf-remote"><span class="emoji">⬇️</span>
            <span>GitHub 내용 불러오기<small>이 기기의 최근 변경은 사라집니다</small></span></button>
          <button type="button" class="action-item" id="cf-local"><span class="emoji">⬆️</span>
            <span>이 기기 내용 올리기<small>GitHub의 최근 변경은 사라집니다</small></span></button>
        </div>
        <button type="button" class="btn ghost" data-close id="cf-cancel" style="margin-top:10px">취소</button>
      `);
      const done = (v) => { closeSheet(); resolve(v); };
      $('#cf-remote').addEventListener('click', () => done('remote'));
      $('#cf-local').addEventListener('click', () => done('local'));
      $('#cf-cancel').addEventListener('click', () => done(null));
      $('#backdrop').addEventListener('click', () => resolve(null), { once: true });
    });
  }

  /* ---------- theme / tabs / events ---------- */
  function applyTheme() {
    document.documentElement.dataset.theme = settings.theme === 'light' ? 'light' : 'dark';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', settings.theme === 'light' ? '#f5f6f8' : '#0a0b0e');
  }

  function switchTab(tab) {
    ui.tab = tab;
    $('#view-todos').hidden = tab !== 'todos';
    $('#view-exp').hidden = tab !== 'exp';
    $$('.tab').forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    render();
  }

  /* ---------- action sheet (FAB) ---------- */
  function openAddSheet() {
    openSheet(`
      <div class="sheet-head"><div><h2 id="sheet-title">새로 추가</h2>
        <p class="sheet-sub">무엇을 남길까요?</p></div>${closeBtn}</div>
      <div class="actions">
        <button type="button" class="action-item" id="add-todo"><span class="emoji">✅</span><span>새 할 일<small>준비물·제출·연락 등</small></span></button>
        <button type="button" class="action-item" id="add-event"><span class="emoji">📅</span><span>새 일정<small>생일파티·행사·예약</small></span></button>
        <button type="button" class="action-item" id="add-exp"><span class="emoji">🧸</span><span>새 경험 기록<small>다녀온 곳·진료·성장 메모</small></span></button>
      </div>
    `);
    $('#add-todo').addEventListener('click', () => openTodoEditor(null));
    $('#add-event').addEventListener('click', () => openEventEditor(null));
    $('#add-exp').addEventListener('click', () => openExperienceEditor(null));
  }

  /* ---------- delete with undo ---------- */
  function deleteItem(kind, id) {
    const arr = kind === 'todo' ? data.todos : kind === 'event' ? data.events : data.experiences;
    const idx = arr.findIndex(x => x.id === id);
    if (idx < 0) return;
    const [removed] = arr.splice(idx, 1);
    touch();
    toast('지웠어요', '', {
      label: '되돌리기',
      fn: () => {
        arr.splice(Math.min(idx, arr.length), 0, removed);
        touch();
      }
    });
  }

  /* ---------- wire up ---------- */
  function wire() {
    $('#btn-sync').addEventListener('click', () => syncNow());
    $$('[data-open]').forEach(b => {
      b.addEventListener('click', () => {
        const what = b.dataset.open;
        if (what === 'people') openPeople();
        else if (what === 'places') openPlaces();
        else openSettings();
      });
    });

    $('#child-filters').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-child]');
      if (chip) { ui.child = chip.dataset.child; render(); return; }
      if (e.target.closest('#hide-done')) { ui.hideDone = !ui.hideDone; render(); }
    });
    $('#tag-filters').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-tag]');
      if (!chip) return;
      ui.tag = chip.dataset.tag || null;
      render();
    });
    $('#exp-filters').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-exp-child]');
      if (!chip) return;
      ui.expChild = chip.dataset.expChild;
      render();
    });

    $('#todo-list').addEventListener('click', (e) => {
      const card = e.target.closest('.todo');
      if (!card) return;
      const id = card.dataset.id;
      const act = e.target.closest('[data-act]');
      if (!act) {
        if (e.target.closest('.check')) return;
        const t = data.todos.find(x => x.id === id);
        if (t) openTodoEditor(id);
        return;
      }
      if (act.dataset.act === 'toggle') {
        const t = data.todos.find(x => x.id === id);
        if (t) { t.done = !t.done; touch(); }
      } else if (act.dataset.act === 'edit') openTodoEditor(id);
      else if (act.dataset.act === 'delete') deleteItem('todo', id);
    });

    $('#event-list').addEventListener('click', (e) => {
      const card = e.target.closest('.event');
      if (!card) return;
      const id = card.dataset.id;
      const act = e.target.closest('[data-act]');
      if (!act || act.dataset.act === 'edit') openEventEditor(id);
      else if (act.dataset.act === 'delete') deleteItem('event', id);
    });

    $('#exp-list').addEventListener('click', (e) => {
      const card = e.target.closest('.exp-item');
      if (!card) return;
      const id = card.dataset.id;
      const act = e.target.closest('[data-act]');
      if (!act || act.dataset.act === 'edit') openExperienceEditor(id);
      else if (act.dataset.act === 'delete') deleteItem('exp', id);
    });

    $('#fab').addEventListener('click', openAddSheet);

    $$('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    window.addEventListener('online', renderStatus);
    window.addEventListener('offline', () => toast('오프라인 · 이 기기 저장은 계속돼요'));
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  async function init() {
    settings = loadSettings();
    applyTheme();
    let stored = null;
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (raw) stored = normalize(JSON.parse(raw));
    } catch (e) { stored = null; }
    data = stored || await seedData();
    if (!stored) saveData(true);
    wire();
    render();
    setInterval(renderStatus, 30000);
    registerSW();
  }

  init();
})();
