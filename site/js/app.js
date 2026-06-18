const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  config: null,
  album: [],
  memoir: [],
  memoirCover: '',
  musicTracks: [],
  view: 'login',
  albumIndex: 0,
  memoirIndex: 0,
  musicIndex: 0,
  memoirOpened: false,
  authenticated: false,
  musicWanted: false,
  musicFailures: 0,
  handlingMusicFailure: false,
};

const views = Object.fromEntries($$('.view').map((view) => [view.dataset.view, view]));
const music = $('#bgMusic');
const musicToggle = $('#musicToggle');
const musicNudge = $('#musicNudge');

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function initialise() {
  try {
    const [config, albumPayload, memoirText, memoirCoverText, musicPayload] = await Promise.all([
      fetchJson('data/config.json'),
      fetchJson('data/album.json'),
      fetchText('data/memoir.txt'),
      fetchText('data/memoir-cover.txt'),
      fetchJson('data/music.json'),
    ]);

    state.config = config;
    state.album = Array.isArray(albumPayload) ? albumPayload : (albumPayload.items || []);
    state.memoir = splitMemoir(memoirText);
    state.memoirCover = memoirCoverText.replace(/\r\n?/g, '\n').trim() || '我们的回忆录';
    state.musicTracks = normaliseMusicTracks(musicPayload);

    $('#memoirCoverText').textContent = state.memoirCover;
    music.volume = clamp(Number(config.music?.volume ?? 0.38), 0, 1);
    document.title = config.siteTitle || '和姐姐的点滴';

    if (state.musicTracks.length) selectMusicTrack(0);
    else markMusicUnavailable('音乐文件夹中还没有可播放的音乐');

    $('#loginButton').disabled = false;
    $('#appStatus').textContent = '';
    document.body.classList.remove('is-loading');
    updateHomeClock();
    renderAlbum(0, false);
    renderMemoir(0, false);
    showMemoirCover(false);
    buildAlbumDots();
    attemptAutoplay();
  } catch (error) {
    console.error(error);
    $('#appStatus').textContent = '内容加载失败，请使用本地服务器打开并检查 data 文件。';
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function splitMemoir(text) {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  return normalized
    ? normalized.split(/\n[ \t]*\n+/).map((paragraph) => paragraph.trim()).filter(Boolean)
    : ['这里还等着我们写下第一段回忆。'];
}

function normaliseMusicTracks(payload) {
  const rawTracks = Array.isArray(payload) ? payload : (payload.tracks || []);
  return rawTracks.map((item) => {
    if (typeof item === 'string') return { src: item, title: titleFromPath(item), artist: '' };
    const src = String(item?.src || '').trim();
    return {
      src,
      title: String(item?.title || titleFromPath(src)).trim(),
      artist: String(item?.artist || '').trim(),
    };
  }).filter((track) => track.src);
}

function titleFromPath(path) {
  const filename = decodeURIComponent(String(path).split('/').pop() || '背景音乐').replace(/\.[^.]+$/, '');
  return filename.replace(/^\d+[\s._-]+/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || '背景音乐';
}

function setView(name) {
  if (!views[name]) return;
  Object.entries(views).forEach(([key, view]) => {
    const active = key === name;
    view.classList.toggle('is-active', active);
    view.setAttribute('aria-hidden', String(!active));
    view.inert = !active;
  });
  state.view = name;
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  if (name === 'album') setTimeout(() => $('#albumPrev').focus({ preventScroll: true }), 120);
  if (name === 'memoir') {
    const target = state.memoirOpened ? $('#memoirPrev') : $('#openMemoirBook');
    setTimeout(() => target.focus({ preventScroll: true }), 120);
  }
}

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.config) return;
  const expected = state.config.credentials;
  const ok = $('#username').value.trim() === expected.username
    && $('#nickname').value.trim() === expected.nickname
    && $('#password').value.trim() === expected.password;
  if (!ok) {
    $('#loginError').hidden = false;
    const form = $('#loginForm');
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
    return;
  }
  $('#loginError').hidden = true;
  state.authenticated = true;
  await startMusic();
  updateHomeClock();
  setView('home');
});

$$('#loginForm input').forEach((input) => input.addEventListener('input', () => { $('#loginError').hidden = true; }));
$('#openAlbum').addEventListener('click', () => { state.albumIndex = 0; renderAlbum(0, false); setView('album'); });
$('#openMemoir').addEventListener('click', () => {
  state.memoirIndex = 0;
  renderMemoir(0, false);
  showMemoirCover(false);
  setView('memoir');
});
$$('[data-back="home"]').forEach((button) => button.addEventListener('click', () => setView('home')));

function localDayNumber(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

function parseIsoDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function updateHomeClock() {
  if (!state.config) return;
  const now = new Date();
  $('#todayDate').textContent = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  }).format(now);
  $('#todayDate').dateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const start = parseIsoDate(state.config.relationshipStart);
  const difference = localDayNumber(now) - localDayNumber(start);
  const count = difference + (state.config.inclusiveDays ? 1 : 0);
  const heading = $('#homeTitle');
  if (count >= 0) {
    heading.innerHTML = `我们在一起已经 <strong id="daysTogether">${count}</strong> 天啦~`;
  } else {
    heading.innerHTML = `距离我们的故事开始还有 <strong id="daysTogether">${Math.abs(difference)}</strong> 天~`;
  }

  const greetings = getHolidayGreetings(now);
  const box = $('#holidayGreeting');
  box.replaceChildren(...greetings.map((text) => {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  }));
  box.hidden = greetings.length === 0;
}

function monthDay(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  return 1 + ((weekday - firstWeekday + 7) % 7) + (nth - 1) * 7;
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const last = new Date(year, monthIndex + 1, 0);
  return last.getDate() - ((last.getDay() - weekday + 7) % 7);
}

function easterDate(year) {
  // Gregorian computus (Meeus/Jones/Butcher), valid for modern Gregorian years.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function qingmingDay(year) {
  const y = year % 100;
  let day = Math.floor(y * 0.2422 + 4.81) - Math.floor(y / 4);
  const corrections = { 2008: 1, 2009: 1, 2016: 1, 2026: 0, 2084: 1 };
  day += corrections[year] || 0;
  return day;
}

function lunarParts(date) {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric' }).formatToParts(date);
    const monthRaw = parts.find((part) => part.type === 'month')?.value || '';
    const dayRaw = parts.find((part) => part.type === 'day')?.value || '';
    return {
      month: Number((monthRaw.match(/\d+/) || [])[0]),
      day: Number((dayRaw.match(/\d+/) || [])[0]),
      leap: /bis|leap/i.test(monthRaw),
    };
  } catch {
    return null;
  }
}

function getHolidayGreetings(date) {
  const names = [];
  const md = monthDay(date);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const fixed = new Map([
    ['01-01', '元旦快乐~'], ['02-14', '情人节快乐~'], ['05-01', '劳动节快乐~'],
    ['06-19', '美国六月节快乐~'], ['07-04', '美国独立日快乐~'],
    ['10-01', '国庆节快乐~'], ['10-31', '万圣节快乐~'],
    ['11-11', '美国退伍军人节快乐~'], ['12-25', '圣诞节快乐~'], ['05-20', '520快乐~'], ['04-04', '纪念日快乐~']
  ]);
  if (fixed.has(md)) names.push(fixed.get(md));
  if (md === state.config.birthday) names.push('姐姐生日快乐~');
  if (md === state.config.relationshipStart.slice(5)) names.push('恋爱纪念日快乐~');
  if (month === 3 && day === qingmingDay(year)) names.push('清明节安康~');

  if (month === 0 && day === nthWeekdayOfMonth(year, 0, 1, 3)) names.push('马丁·路德·金纪念日快乐~');
  if (month === 1 && day === nthWeekdayOfMonth(year, 1, 1, 3)) names.push('美国总统日快乐~');
  if (month === 4 && day === nthWeekdayOfMonth(year, 4, 0, 2)) names.push('母亲节快乐~');
  if (month === 4 && day === lastWeekdayOfMonth(year, 4, 1)) names.push('美国阵亡将士纪念日，愿平安~');
  if (month === 5 && day === nthWeekdayOfMonth(year, 5, 0, 3)) names.push('父亲节快乐~');
  if (month === 8 && day === nthWeekdayOfMonth(year, 8, 1, 1)) names.push('美国劳动节快乐~');
  if (month === 9 && day === nthWeekdayOfMonth(year, 9, 1, 2)) names.push('美国原住民日快乐~');
  if (month === 10 && day === nthWeekdayOfMonth(year, 10, 4, 4)) names.push('感恩节快乐~');
  const easter = easterDate(year);
  if (month === easter.month - 1 && day === easter.day) names.push('复活节快乐~');

  const lunar = lunarParts(date);
  if (lunar && !lunar.leap) {
    const lunarFestivals = new Map([
      ['1-1', '春节'], ['1-15', '元宵节'], ['5-5', '端午节'], ['7-7', '七夕节'],
      ['8-15', '中秋节'], ['9-9', '重阳节'], ['12-8', '腊八节'],
    ]);
    const key = `${lunar.month}-${lunar.day}`;
    if (lunarFestivals.has(key)) names.push(`${lunarFestivals.get(key)}快乐~`);
    const tomorrow = new Date(year, month, day + 1);
    const nextLunar = lunarParts(tomorrow);
    if (nextLunar && !nextLunar.leap && nextLunar.month === 1 && nextLunar.day === 1) names.push('除夕快乐~');
  }
  return [...new Set(names)];
}

function formatPhotoTime(value) {
  const [datePart, timePart = ''] = value.split('T');
  const [year, month, day] = datePart.split('-');
  const [hour = '', minute = ''] = timePart.split(':');
  return `${year}年${Number(month)}月${Number(day)}日${hour ? ` · ${hour}:${minute}` : ''}`;
}

function renderAlbum(index, animate = true) {
  if (!state.album.length) return;
  state.albumIndex = Math.max(0, Math.min(index, state.album.length - 1));
  const item = state.album[state.albumIndex];
  const page = $('#photoPage');
  const apply = () => {
    const image = $('#albumImage');
    image.classList.remove('is-loaded');
    image.onload = () => {
      image.classList.add('is-loaded');
      image.closest('.photo-frame').dataset.orientation = image.naturalWidth >= image.naturalHeight ? 'landscape' : 'portrait';
    };
    image.src = item.src;
    image.alt = item.alt || item.title || '我们的照片';
    $('#photoDate').textContent = formatPhotoTime(item.timestamp || '');
    $('#photoDate').dateTime = item.timestamp || '';
    $('#photoTitle').textContent = item.title || '这一页的回忆';
    $('#photoCaption').textContent = item.caption || '';
    $('#albumCounter').textContent = `${state.albumIndex + 1} / ${state.album.length}`;
    $('#albumPrev').disabled = state.albumIndex === 0;
    $('#albumNext').disabled = state.albumIndex === state.album.length - 1;
    $$('#albumDots i').forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === state.albumIndex));
    preloadAlbumNeighbors();
  };
  if (animate) {
    page.classList.add('page-changing');
    setTimeout(() => { apply(); page.classList.remove('page-changing'); }, 150);
  } else apply();
}

function buildAlbumDots() {
  const dots = $('#albumDots');
  dots.replaceChildren(...state.album.map((_, index) => {
    const dot = document.createElement('i');
    dot.classList.toggle('active', index === 0);
    return dot;
  }));
}

function preloadAlbumNeighbors() {
  [state.albumIndex - 1, state.albumIndex + 1].forEach((index) => {
    if (state.album[index]) {
      const image = new Image();
      image.src = state.album[index].src;
    }
  });
}

$('#albumPrev').addEventListener('click', () => renderAlbum(state.albumIndex - 1));
$('#albumNext').addEventListener('click', () => renderAlbum(state.albumIndex + 1));

function showMemoirCover(animate = true) {
  state.memoirOpened = false;
  const book = $('#memoirBook');
  if (!animate) book.classList.add('no-cover-transition');
  book.classList.remove('is-open');
  const cover = $('#memoirCover');
  const notebook = $('#notebook');
  cover.setAttribute('aria-hidden', 'false');
  notebook.setAttribute('aria-hidden', 'true');
  cover.inert = false;
  notebook.inert = true;
  $('#memoirNav').hidden = true;
  $('#memoirCounter').textContent = '封面';
  if (!animate) requestAnimationFrame(() => book.classList.remove('no-cover-transition'));
  if (state.view === 'memoir') {
    setTimeout(() => {
      if (state.view === 'memoir' && !state.memoirOpened) $('#openMemoirBook').focus({ preventScroll: true });
    }, animate ? 420 : 0);
  }
}

function openMemoirPages() {
  if (state.memoirOpened) return;
  state.memoirOpened = true;
  renderMemoir(state.memoirIndex, false);
  $('#memoirBook').classList.add('is-open');
  const cover = $('#memoirCover');
  const notebook = $('#notebook');
  cover.setAttribute('aria-hidden', 'true');
  notebook.setAttribute('aria-hidden', 'false');
  cover.inert = true;
  notebook.inert = false;
  $('#memoirNav').hidden = false;
  setTimeout(() => {
    if (state.view === 'memoir' && state.memoirOpened) $('#memoirPrev').focus({ preventScroll: true });
  }, 430);
}

function renderMemoir(index, animate = true) {
  if (!state.memoir.length) return;
  const next = Math.max(0, Math.min(index, state.memoir.length - 1));
  const direction = next >= state.memoirIndex ? 'turn-forward' : 'turn-back';
  state.memoirIndex = next;
  const notebook = $('#notebook');
  const apply = () => {
    $('#memoirText').textContent = state.memoir[state.memoirIndex];
    $('#memoirCounter').textContent = `${state.memoirIndex + 1} / ${state.memoir.length}`;
    $('#memoirPageNumber').textContent = String(state.memoirIndex + 1).padStart(2, '0');
    $('#memoirPrev').disabled = false;
    $('#memoirPrev').textContent = state.memoirIndex === 0 ? '← 回到封面' : '← 上一页';
    $('#memoirNext').disabled = state.memoirIndex === state.memoir.length - 1;
  };
  if (animate && state.memoirOpened) {
    notebook.classList.remove('turn-forward', 'turn-back');
    void notebook.offsetWidth;
    notebook.classList.add(direction);
    setTimeout(apply, 170);
    setTimeout(() => notebook.classList.remove(direction), 460);
  } else apply();
}

$('#openMemoirBook').addEventListener('click', openMemoirPages);
$('#memoirPrev').addEventListener('click', () => {
  if (state.memoirIndex === 0) showMemoirCover();
  else renderMemoir(state.memoirIndex - 1);
});
$('#memoirNext').addEventListener('click', () => renderMemoir(state.memoirIndex + 1));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && ['album', 'memoir'].includes(state.view)) setView('home');
  if (state.view === 'album') {
    if (event.key === 'ArrowLeft') renderAlbum(state.albumIndex - 1);
    if (event.key === 'ArrowRight') renderAlbum(state.albumIndex + 1);
  }
  if (state.view === 'memoir') {
    if (!state.memoirOpened && event.key === 'ArrowRight') openMemoirPages();
    else if (state.memoirOpened && event.key === 'ArrowLeft') {
      if (state.memoirIndex === 0) showMemoirCover();
      else renderMemoir(state.memoirIndex - 1);
    } else if (state.memoirOpened && event.key === 'ArrowRight') {
      renderMemoir(state.memoirIndex + 1);
    }
  }
});

function enableSwipe(element, onLeft, onRight) {
  let startX = null;
  element.addEventListener('pointerdown', (event) => { startX = event.clientX; });
  element.addEventListener('pointerup', (event) => {
    if (startX === null) return;
    const delta = event.clientX - startX;
    startX = null;
    if (Math.abs(delta) < 52) return;
    if (delta < 0) onLeft(); else onRight();
  });
  element.addEventListener('pointercancel', () => { startX = null; });
}

enableSwipe($('#albumStage'), () => renderAlbum(state.albumIndex + 1), () => renderAlbum(state.albumIndex - 1));
enableSwipe($('#memoirBook'), () => {
  if (!state.memoirOpened) openMemoirPages();
  else renderMemoir(state.memoirIndex + 1);
}, () => {
  if (!state.memoirOpened) return;
  if (state.memoirIndex === 0) showMemoirCover();
  else renderMemoir(state.memoirIndex - 1);
});

function currentMusicTrack() {
  return state.musicTracks[state.musicIndex] || null;
}

function selectMusicTrack(index) {
  if (!state.musicTracks.length) return;
  state.musicIndex = ((index % state.musicTracks.length) + state.musicTracks.length) % state.musicTracks.length;
  const track = currentMusicTrack();
  music.src = track.src;
  music.load();
  updateMusicUi(false);
}

function isAutoplayBlocked(error) {
  return error?.name === 'NotAllowedError' || /user.*interact|gesture|not allowed/i.test(String(error?.message || ''));
}

async function attemptAutoplay() {
  if (!state.musicTracks.length) return;
  state.musicWanted = true;
  try {
    await music.play();
    state.musicFailures = 0;
    musicNudge.hidden = true;
    updateMusicUi(true);
  } catch (error) {
    if (isAutoplayBlocked(error)) {
      state.musicWanted = false;
      showMusicNudge();
      updateMusicUi(false);
    } else {
      await handleMusicFailure(error);
    }
  }
}

async function startMusic() {
  if (!state.musicTracks.length) {
    markMusicUnavailable('音乐文件夹中还没有可播放的音乐');
    return false;
  }
  if (!music.getAttribute('src')) selectMusicTrack(state.musicIndex);
  state.musicWanted = true;
  try {
    await music.play();
    state.musicFailures = 0;
    musicNudge.hidden = true;
    updateMusicUi(true);
    return true;
  } catch (error) {
    if (isAutoplayBlocked(error)) {
      state.musicWanted = false;
      showMusicNudge();
      updateMusicUi(false);
      return false;
    }
    await handleMusicFailure(error);
    return !music.paused;
  }
}

async function advanceMusic() {
  if (!state.musicTracks.length || !state.musicWanted) return;
  state.musicFailures = 0;
  selectMusicTrack(state.musicIndex + 1);
  try {
    await music.play();
    musicNudge.hidden = true;
    updateMusicUi(true);
  } catch (error) {
    if (isAutoplayBlocked(error)) {
      state.musicWanted = false;
      showMusicNudge();
      updateMusicUi(false);
    } else {
      await handleMusicFailure(error);
    }
  }
}

async function handleMusicFailure(error) {
  if (!state.musicWanted || state.handlingMusicFailure || !state.musicTracks.length) return;
  state.handlingMusicFailure = true;
  console.warn('背景音乐无法播放，正在跳到下一首：', currentMusicTrack()?.src, error);
  state.musicFailures += 1;

  if (state.musicFailures >= state.musicTracks.length) {
    state.musicWanted = false;
    state.handlingMusicFailure = false;
    markMusicUnavailable('播放列表中的音乐暂时都无法播放');
    return;
  }

  selectMusicTrack(state.musicIndex + 1);
  try {
    await music.play();
    state.musicFailures = 0;
    state.handlingMusicFailure = false;
    musicNudge.hidden = true;
    updateMusicUi(true);
  } catch (nextError) {
    state.handlingMusicFailure = false;
    if (isAutoplayBlocked(nextError)) {
      state.musicWanted = false;
      showMusicNudge();
      updateMusicUi(false);
    } else {
      await handleMusicFailure(nextError);
    }
  }
}

function showMusicNudge(message = '') {
  const track = currentMusicTrack();
  const defaultText = track ? `轻触开启背景音乐 · ${track.title}` : '轻触开启背景音乐';
  musicNudge.textContent = message || defaultText;
  musicNudge.hidden = false;
}

function markMusicUnavailable(message) {
  state.musicWanted = false;
  music.pause();
  musicToggle.disabled = true;
  musicToggle.classList.remove('is-playing');
  musicToggle.setAttribute('aria-pressed', 'false');
  musicToggle.setAttribute('aria-label', message);
  musicToggle.title = message;
  $('.music-state', musicToggle).textContent = '无音乐';
  musicNudge.textContent = message;
  musicNudge.hidden = false;
}

function updateMusicUi(playing) {
  if (!state.musicTracks.length) return;
  const track = currentMusicTrack();
  const position = `${state.musicIndex + 1}/${state.musicTracks.length}`;
  const label = track.artist ? `${track.title} · ${track.artist}` : track.title;
  musicToggle.disabled = false;
  musicToggle.classList.toggle('is-playing', playing);
  musicToggle.setAttribute('aria-pressed', String(playing));
  musicToggle.setAttribute('aria-label', playing ? `暂停背景音乐：${label}` : `播放背景音乐：${label}`);
  musicToggle.title = `背景音乐：${label}（${position}）`;
  $('.music-state', musicToggle).textContent = playing ? `播放中 ${position}` : `音乐 ${position}`;
}

musicToggle.addEventListener('click', async () => {
  if (music.paused) await startMusic();
  else {
    state.musicWanted = false;
    music.pause();
    updateMusicUi(false);
  }
});
musicNudge.addEventListener('click', startMusic);
music.addEventListener('play', () => updateMusicUi(true));
music.addEventListener('playing', () => {
  state.musicFailures = 0;
  musicNudge.hidden = true;
  updateMusicUi(true);
});
music.addEventListener('pause', () => updateMusicUi(false));
music.addEventListener('ended', advanceMusic);
music.addEventListener('error', () => {
  if (state.musicWanted) handleMusicFailure(music.error);
});
document.addEventListener('pointerdown', (event) => {
  const clickedMusicControl = musicToggle.contains(event.target) || musicNudge.contains(event.target);
  if (!clickedMusicControl && music.paused) startMusic();
}, { once: true, capture: true });

setInterval(updateHomeClock, 60_000);
initialise();
