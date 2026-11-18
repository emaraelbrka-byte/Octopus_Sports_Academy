// ---------- admin pages ----------
// Each admin area is its own page: #/admin (dashboard), #/admin/condos, #/admin/classes, and so on.
// Helpers used here (api, bindForm, esc, fmtTime, levelOptions, requestDetails, openProposalEditor, toast) live in app.js.

const ADMIN_PAGES = [
  ['condos', 'Add - Manage condo', 'Add condos and edit or delete existing ones'],
  ['classes', 'Add - Manage class', 'Add classes, and edit or delete existing ones'],
  ['sessions', 'Add sessions', 'Schedule dates for a class'],
  ['requests', 'Class requests', 'Review, edit and publish requested classes'],
  ['users', 'Users', 'Search users and change their roles'],
  ['prices', 'Price list', 'Package prices in RM per person'],
  ['settings', 'Chat & request limits', 'Chat retention and class request limits'],
  ['ratings', 'Low ratings', 'Students rated 2 stars or less'],
];

// Link back to the dashboard, shown at the top of every admin subpage
const adminBack = () => '<p class="crumbs"><a href="#/admin">Admin</a></p>';

const ADMIN_ICONS = {
  condos: 'building', classes: 'wave', sessions: 'calendar', requests: 'inbox',
  users: 'users', prices: 'tag', settings: 'sliders', ratings: 'star',
};

// Breadcrumb + icon + title + one-line description, shared by every admin subpage
const formTitle = (ic, title, sub = '') => `
  <div class="form-title"><span class="panel-icon">${icon(ic)}</span><div><h3>${title}</h3>${sub ? `<p class="muted">${sub}</p>` : ''}</div></div>`;

function adminHeader(slug) {
  const [, title, desc] = ADMIN_PAGES.find(([s]) => s === slug);
  return `
    <p class="crumbs"><a href="#/admin">Admin</a><span>/</span>${esc(title)}</p>
    <div class="page-head">
      <span class="page-icon">${icon(ADMIN_ICONS[slug])}</span>
      <div><h1>${esc(title)}</h1><p class="muted">${esc(desc)}</p></div>
    </div>`;
}

// Entry point for every /admin route. section is '' for the dashboard.
async function admin(section = '') {
  clearTimers();
  const pages = {
    condos: adminCondos,
    classes: adminClasses,
    sessions: adminSessions,
    requests: adminRequests,
    users: adminUsers,
    prices: adminPrices,
    settings: adminSettings,
    ratings: adminRatings,
  };
  if (!section) return adminDashboard();
  if (!pages[section]) {
    $('#app').innerHTML = `${adminBack()}<p class="card">Page not found.</p>`;
    return;
  }
  return pages[section]();
}

async function adminDashboard() {
  const stats = await api('/admin/stats');
  // [label, value, icon, link] — requests and low ratings are highlighted when they need attention
  const items = [
    ['Users', stats.users, 'users', 'users'], ['Coaches', stats.coaches, 'whistle', 'users'],
    ['Condos', stats.condos, 'building', 'condos'], ['Classes', stats.classes, 'wave', 'classes'],
    ['Open requests', stats.open_requests, 'inbox', 'requests', true], ['Low ratings', stats.low_ratings, 'star', 'ratings', true],
  ];
  const todo = Number(stats.open_requests) + Number(stats.low_ratings);
  $('#app').innerHTML = `
    <section class="profile-hero admin-hero">
      <div class="profile-id">
        <span class="avatar lg logo-avatar" aria-hidden="true">${LOGO}</span>
        <div>
          <span class="eyebrow">Admin</span>
          <h1>Academy dashboard</h1>
          <div class="profile-meta"><span class="role-chip">${icon('shield')} Admin</span><span>${todo ? `${todo} item${todo === 1 ? '' : 's'} need your attention` : 'Everything is up to date'}</span></div>
        </div>
      </div>
      <div class="hero-actions">
        <a href="#/admin/condos"><button type="button">${icon('plus')} Condo</button></a>
        <a href="#/admin/classes"><button type="button" class="ghost">${icon('plus')} Class</button></a>
      </div>
    </section>
    <div class="stat-grid">
      ${items.map(([label, value, ic, slug, alert]) => `
        <a class="stat-tile${alert && Number(value) > 0 ? ' alert' : ''}" href="#/admin/${slug}">
          <span class="stat-icon">${icon(ic)}</span>
          <strong>${esc(value)}</strong><span>${label}</span>
        </a>`).join('')}
    </div>
    <div class="section-head"><div><span class="eyebrow">Manage</span><h2>Academy tools</h2></div></div>
    <div class="tool-grid">
      ${ADMIN_PAGES.map(([slug, title, desc]) => `
        <a class="card tool-card" href="#/admin/${slug}">
          <span class="page-icon">${icon(ADMIN_ICONS[slug])}</span>
          <span class="spacer"><h3>${esc(title)}</h3><span class="muted">${esc(desc)}</span></span>
          <span class="condo-go">${icon('arrow')}</span>
        </a>`).join('')}
    </div>`;
}

// ---------- Add - Manage condo ----------
// Only the name is required. Every condo is listed below (hidden ones too) with Edit and Delete.
async function adminCondos() {
  let editingId = null;
  let condos = [];

  const condoFields = (c = {}) => `
    <div class="field"><label>Name *</label><input name="name" required minlength="2" maxlength="120" value="${esc(c.name || '')}"></div>
    <div class="field"><label>Address (optional)</label><input name="address" maxlength="300" value="${esc(c.address || '')}"></div>
    <div class="field"><label>Image URL (optional)</label><input name="image_url" type="url" value="${esc(c.image_url || '')}"></div>
    <div class="field"><label>Description (optional)</label><textarea name="description" rows="2">${esc(c.description || '')}</textarea></div>`;

  const drawList = () => {
    const box = $('#condoList');
    $('#condoCount').textContent = condos.length;
    if (!condos.length) {
      box.innerHTML = '<div class="empty-state"><h3>No condos yet</h3><p class="muted">Add your first condo above.</p></div>';
      return;
    }
    box.innerHTML = condos.map((c) => (c.id === editingId
      ? `<form class="panel admin-form" data-edit-form="${esc(c.id)}">
           ${formTitle('building', `Edit ${esc(c.name)}`)}
           ${condoFields(c)}
           <p data-msg class="error"></p>
           <div class="row">
             <button type="button" class="secondary" data-cancel>Cancel</button>
             <span class="spacer"></span>
             <button type="submit">Save changes</button>
           </div>
         </form>`
      : `<div class="card row list-row">
           <span class="condo-tile sm">${icon('building')}</span>
           <div class="spacer">
             <strong>${esc(c.name)}</strong>${c.is_published ? '' : ' <span class="badge late">hidden from students</span>'}
             <div class="muted">${esc(c.address || 'No address')} · ${c.class_count} class${c.class_count === 1 ? '' : 'es'}</div>
           </div>
           <button type="button" class="secondary" data-edit="${esc(c.id)}">Edit</button>
           <button type="button" class="danger" data-delete="${esc(c.id)}">Delete</button>
         </div>`)).join('');

    box.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => { editingId = b.dataset.edit; drawList(); }));
    box.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = () => { editingId = null; drawList(); }));
    box.querySelectorAll('[data-edit-form]').forEach((form) => {
      const id = form.dataset.editForm;
      const msg = form.querySelector('[data-msg]');
      form.onsubmit = async (e) => {
        e.preventDefault();
        msg.textContent = '';
        try {
          await api(`/admin/condos/${id}`, { method: 'PUT', body: Object.fromEntries(new FormData(form)) });
          editingId = null;
          toast('Condo saved');
          await loadList();
        } catch (err) {
          msg.textContent = err.message;
        }
      };
    });
    box.querySelectorAll('[data-delete]').forEach((b) => (b.onclick = async () => {
      const c = condos.find((x) => x.id === b.dataset.delete);
      const ok = confirm(`Delete "${c.name}"? This also deletes its ${c.class_count} class(es), their sessions, enrolments and chat. This cannot be undone.`);
      if (!ok) return;
      try {
        await api(`/admin/condos/${c.id}`, { method: 'DELETE' });
        toast('Condo deleted');
        await loadList();
      } catch (err) {
        toast(err.message);
      }
    }));
  };

  const loadList = async () => {
    ({ condos } = await api('/admin/condos'));
    drawList();
  };

  $('#app').innerHTML = `
    ${adminHeader('condos')}
    <form id="fCondo" class="panel admin-form">
      ${formTitle('plus', 'Add a condo', 'Only the name is needed. Students see it on the home page.')}
      ${condoFields()}
      <p data-msg class="error"></p>
      <button type="submit">Add condo</button>
    </form>
    <h2>All condos (<span id="condoCount">0</span>)</h2>
    <div id="condoList"></div>`;

  bindForm('#fCondo', async (d, form) => {
    await api('/admin/condos', { body: d });
    form.reset();
    await loadList();
    return 'Condo added';
  });
  await loadList();
}

// ---------- Add class ----------
// Same way the customer picks a class: tick the days, and the name and package price are filled in automatically.
const ADMIN_DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const isAdminWeekend = (c) => c === 'sat' || c === 'sun';

// "Monday & Wednesday Group - Intermediate" or "Saturday Private One to One - Beginner"
function autoClassName(days, classType, level) {
  const names = ADMIN_DAYS.filter(([code]) => days.includes(code)).map(([, label]) => label);
  if (!names.length) return '';
  const levelText = level ? ` - ${level[0].toUpperCase()}${level.slice(1)}` : '';
  return `${names.join(' & ')} ${classType === 'one_to_one' ? 'Private One to One' : 'Group'}${levelText}`;
}

const ADMIN_DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const KL_MS = 8 * 3600 * 1000; // Malaysia is UTC+8 with no daylight saving

// The next lesson start times (ms) for the chosen days at a Malaysia-time start.
// The total is spread across the days like the seed data: classes_per_month / number of days.
function scheduleStarts(days, hhmm, total) {
  const [h, m] = hhmm.split(':').map(Number);
  const perDay = Math.ceil(total / days.length);
  const out = [];
  for (const code of days) {
    let from = Date.now();
    for (let i = 0; i < perDay; i++) {
      const kl = new Date(from + KL_MS);
      let found = null;
      for (let add = 0; add < 8 && found === null; add++) {
        const cand = Date.UTC(kl.getUTCFullYear(), kl.getUTCMonth(), kl.getUTCDate() + add, h, m) - KL_MS;
        if (cand > from && new Date(cand + KL_MS).getUTCDay() === ADMIN_DOW[code]) found = cand;
      }
      out.push(found);
      from = found;
    }
  }
  return out.sort((a, b) => a - b);
}

// 1 day = once a week (4 classes a month), 2 days = twice a week (8 classes a month)
function packageFor(days) {
  const weekend = days.filter(isAdminWeekend).length;
  const dayGroup = weekend === 0 ? 'weekdays' : weekend === days.length ? 'weekends' : 'mixed';
  return { day_group: dayGroup, classes_per_month: days.length === 2 ? 8 : 4 };
}

async function adminClasses() {
  const [{ condos }, { coaches }, { plans }] = await Promise.all([
    api('/condos?limit=50'),
    api('/admin/coaches'),
    api('/price-plans'),
  ]);
  // Price per tier (cents) for a package. Mixed = average of the weekday and weekend packages.
  const planFor = (dayGroup, perMonth) => {
    if (dayGroup !== 'mixed') return plans[`${dayGroup}-${perMonth}`] || {};
    const wd = plans[`weekdays-${perMonth}`] || {};
    const we = plans[`weekends-${perMonth}`] || {};
    return Object.fromEntries(['1', '2', '3', '4-6'].map((t) => [t, Math.round(((wd[t] || 0) + (we[t] || 0)) / 2)]));
  };
  const condoOptions = condos.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  const coachOptions = coaches.map((c) => `<option value="${esc(c.id)}">${esc(c.username)}</option>`).join('');
  const dayBoxes = dayChips(ADMIN_DAYS, isAdminWeekend);

  $('#app').innerHTML = `
    ${adminHeader('classes')}
    <form id="fClass" class="panel admin-form">
      ${formTitle('plus', 'Add a class', 'Tick the days: the name, the package price and one month of sessions are made for you.')}
      <div class="row">
        <div class="field spacer"><label>Condo</label><select name="condo_id" required>${condoOptions}</select></div>
        <div class="field spacer"><label>Type</label><select name="class_type"><option value="group">Group</option><option value="one_to_one">Private One to One</option></select></div>
      </div>
      <div class="field"><label>Days (1 day = once a week, 2 days = twice a week)</label>${dayBoxes}</div>
      <div class="field"><label>Class name (automatic)</label><input id="autoName" disabled value="(choose the days)"></div>
      <div class="row">
        <div class="field spacer"><label>Level</label><select name="skill_level">${levelOptions()}</select></div>
        <div class="field spacer" id="capacityField"><label>Capacity</label><input name="capacity" type="number" value="10" min="1" required></div>
      </div>
      <div class="row">
        <div class="field spacer"><label>Min age</label><input name="min_age" type="number" value="0" required></div>
        <div class="field spacer"><label>Max age</label><input name="max_age" type="number" value="120" required></div>
        <div class="field spacer"><label>Duration (min)</label><input name="duration_min" type="number" value="60" min="15" required></div>
        <div class="field spacer"><label>Start time (Malaysia)</label><input name="start_time" type="time" value="13:00" required></div>
      </div>
      <div class="row">
        <div class="field spacer"><label>Coach</label><select name="coach_id"><option value="">— none yet —</option>${coachOptions}</select></div>
        <div class="field spacer"><label>Schedule text (optional)</label><input name="schedule_text" placeholder="Monday 1:00pm–1:40pm"></div>
      </div>
      <div id="priceBox" class="card price-box"></div>
      <p data-msg class="error"></p>
      <button type="submit" class="block">Save class</button>
    </form>
    <h2>All classes (<span id="classCount">0</span>)</h2>
    <div id="classList"></div>`;

  const form = $('#fClass');
  const selectedDays = () => [...form.querySelectorAll('input[name="days"]:checked')].map((i) => i.value);

  // Shows the automatic name and the package price table
  const render = () => {
    const days = selectedDays();
    const classType = form.querySelector('[name="class_type"]').value;
    const level = form.querySelector('[name="skill_level"]').value;
    $('#autoName').value = autoClassName(days, classType, level) || '(choose the days)';
    // A private one-to-one class always has capacity 1, so the field is hidden for it
    const capField = form.querySelector('#capacityField');
    const isPrivate = classType === 'one_to_one';
    capField.hidden = isPrivate;
    capField.querySelector('input').required = !isPrivate;
    const box = form.querySelector('#priceBox');
    const head = '<strong>Package price per person</strong>';
    if (!days.length) {
      box.innerHTML = `${head}<p class="muted">Choose the days to see the price.</p>`;
      return;
    }
    if (days.length > 2) {
      box.innerHTML = `${head}<p class="error">Choose 1 day (once a week) or 2 days (twice a week).</p>`;
      return;
    }
    const pkg = packageFor(days);
    const plan = planFor(pkg.day_group, pkg.classes_per_month);
    const tagText = {
      weekdays: 'Weekdays (Mon–Fri)', weekends: 'Weekends (Sat–Sun)', mixed: 'Mixed: weekday + weekend (average of both)',
    }[pkg.day_group];
    const freq = `${days.length === 2 ? 'Twice' : 'Once'} a week · ${pkg.classes_per_month} classes a month`;
    box.innerHTML = `${head}
      <div class="muted" style="margin:6px 0">${tagText} · ${freq}</div>
      ${Object.keys(plan).length
        ? `<div class="price-grid">${[['1', '1 person'], ['2', '2 people'], ['3', '3 people'], ['4-6', '4–6 people']]
          .map(([t, text]) => `<div><span class="muted">${text}</span><strong>${rm(plan[t])}</strong></div>`).join('')}</div>`
        : '<p class="muted">Price not set yet. Set it in Price list.</p>'}`;
  };
  form.addEventListener('change', render);
  render();

  bindForm('#fClass', async (d, f) => {
    const days = selectedDays();
    if (days.length < 1 || days.length > 2) throw new Error('Choose 1 day (once a week) or 2 days (twice a week)');
    const pkg = packageFor(days);
    const price = planFor(pkg.day_group, pkg.classes_per_month)['1'] || 0;
    const { class: created } = await api('/admin/classes', {
      body: {
        condo_id: d.condo_id,
        coach_id: d.coach_id || null,
        name: autoClassName(days, d.class_type, d.skill_level),
        class_type: d.class_type,
        skill_level: d.skill_level,
        min_age: Number(d.min_age),
        max_age: Number(d.max_age),
        capacity: d.class_type === 'one_to_one' ? 1 : Number(d.capacity),
        price_cents: price,
        duration_min: Number(d.duration_min),
        day_group: pkg.day_group,
        classes_per_month: pkg.classes_per_month,
        schedule_text: d.schedule_text || null,
      },
    });
    // Create the upcoming lessons so the student page shows the next class and the class days
    const dur = Number(d.duration_min) * 60000;
    const starts = scheduleStarts(days, d.start_time, pkg.classes_per_month);
    await api(`/admin/classes/${created.id}/sessions`, {
      body: { sessions: starts.map((s) => ({ starts_at: new Date(s).toISOString(), ends_at: new Date(s + dur).toISOString() })) },
    });
    f.reset();
    render();
    adminClassList();
    return `Class saved with ${starts.length} upcoming sessions`;
  });
  await adminClassList();
}

// ---------- All classes: a table with Edit and Delete ----------
async function adminClassList() {
  const { classes, min_size: min } = await api('/admin/classes');
  const find = (id) => classes.find((x) => x.id === id);
  $('#classCount').textContent = classes.length;
  const box = $('#classList');
  if (!classes.length) {
    box.innerHTML = '<div class="empty-state"><h3>No classes yet</h3><p class="muted">Add your first class above.</p></div>';
    return;
  }
  box.innerHTML = `<div class="card table-card">
    <table class="stack">
      <thead><tr><th>Class</th><th>Condo</th><th>Coach</th><th>Price</th><th>Sessions</th><th></th></tr></thead>
      <tbody>
        ${classes.map((c) => `<tr>
          <td data-label="Class"><strong>${esc(c.name)}</strong>
            <div class="muted">${c.class_type === 'one_to_one' ? 'Private' : 'Group'} · ${esc(c.skill_level)} · ages ${c.min_age}–${c.max_age}</div></td>
          <td data-label="Condo">${esc(c.condo_name)}</td>
          <td data-label="Coach">${esc(c.coach_name || 'To be assigned')}</td>
          <td data-label="Price per person">${rm(c.price_per_person_cents ?? c.price_cents)}<div class="muted">${c.day_group ? `${esc(c.day_group)} · ${c.classes_per_month}/month` : 'fixed price'}</div></td>
          <td data-label="Sessions">${c.sessions} scheduled<div class="muted">${c.enrolled}/${c.capacity} enrolled</div>${adminStatusBadge(c, min)}</td>
          <td style="white-space:nowrap">
            <button type="button" class="secondary" data-payments="${esc(c.id)}">Payments</button>
            <button type="button" class="secondary" data-edit-class="${esc(c.id)}">Edit</button>
            <button type="button" class="danger" data-delete-class="${esc(c.id)}">Delete</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;

  box.querySelectorAll('[data-edit-class]').forEach((b) => (b.onclick = () => openClassEditor(find(b.dataset.editClass))));
  box.querySelectorAll('[data-payments]').forEach((b) => (b.onclick = () => openPayments(find(b.dataset.payments), min)));
  box.querySelectorAll('[data-delete-class]').forEach((b) => (b.onclick = async () => {
    const c = find(b.dataset.deleteClass);
    const ok = confirm(`Delete "${c.name}"? This also deletes its ${c.sessions} session(s) and ${c.enrolled} enrolment(s), with their attendance and ratings. This cannot be undone.`);
    if (!ok) return;
    try {
      await api(`/admin/classes/${c.id}`, { method: 'DELETE' });
      toast('Class deleted');
      adminClassList();
    } catch (err) {
      toast(err.message);
    }
  }));
}

// Status line under the enrolment count: red = forming, orange = waiting for payment, green = confirmed
function adminStatusBadge(c, min) {
  if (c.class_type !== 'group') return '';
  if (c.status === 'forming') return `<div><span class="badge full">In progress · ${c.enrolled}/${min} joined</span></div>`;
  if (c.status === 'payment') return `<div><span class="badge late">Waiting for payment · ${c.paid}/${c.enrolled} paid</span></div>`;
  return '<div><span class="badge ok">Confirmed · all paid</span></div>';
}

// Payments popup: tick a participant once their payment is received
async function openPayments(c, min) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal" style="max-width:480px;width:100%;max-height:90vh;overflow:auto;text-align:left">
      <h2 class="modal-title">${icon('tag')} Payments · ${esc(c.name)}</h2>
      <p class="muted" id="payInfo"></p>
      <div id="payList">Loading...</div>
      <p class="muted" style="font-size:13px">Online payment is not connected yet, so the academy ticks people as paid here when the money is received.</p>
      <div class="row"><span class="spacer"></span><button type="button" class="secondary" data-close>Close</button></div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('[data-close]').onclick = () => { wrap.remove(); adminClassList(); };

  const load = async () => {
    const { enrollments } = await api(`/admin/classes/${c.id}/enrollments`);
    const paid = enrollments.filter((e) => e.paid).length;
    wrap.querySelector('#payInfo').textContent = `${enrollments.length} joined (minimum ${min}) · ${paid} paid`;
    wrap.querySelector('#payList').innerHTML = enrollments.length
      ? `<table><thead><tr><th>Participant</th><th>Account</th><th>Paid</th></tr></thead><tbody>
          ${enrollments.map((e) => `<tr>
            <td>${esc(e.participant_name)}</td>
            <td class="muted">${esc(e.username)}</td>
            <td><input type="checkbox" data-paid="${esc(e.id)}" ${e.paid ? 'checked' : ''} style="width:auto"></td>
          </tr>`).join('')}
        </tbody></table>`
      : '<p class="muted">Nobody has joined yet.</p>';
    wrap.querySelectorAll('[data-paid]').forEach((box) => (box.onchange = async () => {
      try {
        await api(`/admin/enrollments/${box.dataset.paid}/paid`, { method: 'PATCH', body: { paid: box.checked } });
        await load();
      } catch (err) {
        toast(err.message);
        box.checked = !box.checked;
      }
    }));
  };
  await load();
}

// Edit form in a popup. Days and times are changed through the sessions, so the price package stays as it is.
async function openClassEditor(c) {
  const [{ condos }, { coaches }] = await Promise.all([api('/admin/condos'), api('/admin/coaches')]);
  const opt = (list, selectedId, labelKey) => list
    .map((o) => `<option value="${esc(o.id)}" ${o.id === selectedId ? 'selected' : ''}>${esc(o[labelKey])}</option>`).join('');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <form class="modal" style="max-width:520px;width:100%;max-height:90vh;overflow:auto;text-align:left">
      <h2 class="modal-title">${icon('wave')} Edit class</h2>
      <div class="field"><label>Name</label><input name="name" required minlength="2" maxlength="120" value="${esc(c.name)}"></div>
      <div class="field"><label>Condo</label><select name="condo_id">${opt(condos, c.condo_id, 'name')}</select></div>
      <div class="field"><label>Coach</label><select name="coach_id"><option value="">— none yet —</option>${opt(coaches, c.coach_id, 'username')}</select></div>
      <div class="row">
        <div class="field spacer"><label>Type</label><select name="class_type">
          <option value="group" ${c.class_type === 'group' ? 'selected' : ''}>Group</option>
          <option value="one_to_one" ${c.class_type === 'one_to_one' ? 'selected' : ''}>Private One to One</option></select></div>
        <div class="field spacer"><label>Level</label><select name="skill_level">${levelOptions(c.skill_level)}</select></div>
      </div>
      <div class="row">
        <div class="field spacer"><label>Min age</label><input name="min_age" type="number" value="${c.min_age}" required></div>
        <div class="field spacer"><label>Max age</label><input name="max_age" type="number" value="${c.max_age}" required></div>
      </div>
      <div class="row">
        <div class="field spacer" data-cap><label>Capacity</label><input name="capacity" type="number" min="1" value="${c.capacity}" required></div>
        <div class="field spacer"><label>Duration (min)</label><input name="duration_min" type="number" min="15" value="${c.duration_min}" required></div>
      </div>
      <div class="field"><label>Schedule text (optional)</label><input name="schedule_text" value="${esc(c.schedule_text || '')}"></div>
      <p class="muted" style="font-size:13px">Days and times are set by the sessions. The price follows the price list.</p>
      <p data-msg class="error"></p>
      <div class="row">
        <button type="button" class="secondary" data-cancel>Cancel</button>
        <span class="spacer"></span>
        <button type="submit">Save</button>
      </div>
    </form>`;
  document.body.appendChild(wrap);

  const form = wrap.querySelector('form');
  const val = (n) => form.querySelector(`[name="${n}"]`).value;
  const capField = form.querySelector('[data-cap]');
  // A private one-to-one class always has capacity 1
  const syncCapacity = () => {
    const isPrivate = val('class_type') === 'one_to_one';
    capField.hidden = isPrivate;
    capField.querySelector('input').required = !isPrivate;
  };
  form.addEventListener('change', syncCapacity);
  syncCapacity();

  wrap.querySelector('[data-cancel]').onclick = () => wrap.remove();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const isPrivate = val('class_type') === 'one_to_one';
    try {
      await api(`/admin/classes/${c.id}`, {
        method: 'PUT',
        body: {
          condo_id: val('condo_id'),
          coach_id: val('coach_id') || null,
          name: val('name').trim(),
          class_type: val('class_type'),
          skill_level: val('skill_level'),
          min_age: Number(val('min_age')),
          max_age: Number(val('max_age')),
          capacity: isPrivate ? 1 : Number(val('capacity')),
          price_cents: c.price_cents,
          duration_min: Number(val('duration_min')),
          day_group: c.day_group,
          classes_per_month: c.classes_per_month,
          schedule_text: val('schedule_text') || null,
        },
      });
      wrap.remove();
      toast('Class saved');
      // Clear an old error left in the Add class form above
      const addMsg = document.querySelector('#fClass [data-msg]');
      if (addMsg) addMsg.textContent = '';
      adminClassList();
    } catch (err) {
      form.querySelector('[data-msg]').textContent = err.message;
    }
  };
}

// ---------- Add sessions ----------
async function adminSessions() {
  // Classes grouped by condo for the dropdown (the list comes sorted by condo, then class name)
  const { classes } = await api('/admin/classes');
  const byCondo = new Map();
  for (const c of classes) {
    if (!byCondo.has(c.condo_name)) byCondo.set(c.condo_name, []);
    byCondo.get(c.condo_name).push(c);
  }
  const classOptions = [...byCondo].map(([condo, list]) => `
    <optgroup label="${esc(condo)}">
      ${list.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
    </optgroup>`).join('');
  $('#app').innerHTML = `
    ${adminHeader('sessions')}
    <form id="fSess" class="panel admin-form">
      ${formTitle('calendar', 'Add a session', 'One extra date for a class. Times are Malaysia time.')}
      <div class="row">
        <div class="field spacer"><label for="sessClass">Class</label>
          <select id="sessClass" name="class_id" required>
            <option value="">${classes.length ? '— choose a class —' : 'No classes yet'}</option>${classOptions}
          </select></div>
        <div class="field spacer"><label>Starts (Malaysia time)</label><input name="starts_at" type="datetime-local" required></div>
        <div class="field spacer"><label>Ends</label><input name="ends_at" type="datetime-local" required></div>
      </div>
      <p data-msg class="error"></p><button type="submit">Add session</button>
    </form>`;
  bindForm('#fSess', async (d, form) => {
    await api(`/admin/classes/${d.class_id.trim()}/sessions`, {
      body: { sessions: [{ starts_at: new Date(d.starts_at).toISOString(), ends_at: new Date(d.ends_at).toISOString() }] },
    });
    form.querySelector('[name="starts_at"]').value = '';
    form.querySelector('[name="ends_at"]').value = '';
    return 'Session added';
  });
}

// ---------- Class requests ----------
async function adminRequests() {
  const [{ requests }, { coaches }] = await Promise.all([api('/admin/class-requests'), api('/admin/coaches')]);
  const requestsById = Object.fromEntries(requests.map((r) => [r.id, r]));
  $('#app').innerHTML = `
    ${adminHeader('requests')}
    <div class="card table-card">
      ${requests.length ? `<table class="stack"><thead><tr><th>Date</th><th>Condo</th><th>Contact</th><th>Details</th><th>Status</th></tr></thead><tbody>
        ${requests.map((r) => `<tr>
          <td data-label="Date">${esc(fmtTime(r.created_at))}</td><td data-label="Condo">${esc(r.condo_name)}</td>
          <td data-label="Contact">${esc(r.username)}<div class="muted">${esc(r.phone)}</div></td>
          <td data-label="Details">${requestDetails(r)}</td>
          <td data-label="Status"><select data-req="${esc(r.id)}">${['new', 'in_progress', 'done', 'rejected'].map((s) => `<option ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty-state"><h3>No open requests</h3><p class="muted">New class and condo requests from students appear here.</p></div>'}
    </div>`;

  document.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openProposalEditor(requestsById[b.dataset.edit], coaches)));
  document.querySelectorAll('[data-approve]').forEach((b) => (b.onclick = async () => {
    const r = requestsById[b.dataset.approve];
    // Old requests (made before the customer form asked for a time) need the admin to pick one
    if (!r.details.start_time) return openApprove(r);
    // Otherwise the class is created exactly as the customer asked
    b.disabled = true;
    try {
      const res = await api(`/admin/class-requests/${r.id}/approve`, { body: {} });
      toast(res.message);
      admin('requests');
    } catch (err) {
      b.disabled = false;
      toast(err.message);
    }
  }));
  document.querySelectorAll('[data-req]').forEach((sel) => {
    sel.dataset.prev = sel.value;
    sel.onchange = async () => {
      // Rejecting deletes the request and all its details, so ask first
      if (sel.value === 'rejected' && !confirm('Reject this request? It will be deleted with all its details. This cannot be undone.')) {
        sel.value = sel.dataset.prev;
        return;
      }
      try {
        const res = await api(`/admin/class-requests/${sel.dataset.req}`, { method: 'PATCH', body: { status: sel.value } });
        toast(res.message);
        // Rejected (deleted) and done requests leave the list
        if (sel.value === 'rejected' || sel.value === 'done') admin('requests');
        else sel.dataset.prev = sel.value;
      } catch (err) {
        sel.value = sel.dataset.prev;
        toast(err.message);
      }
    };
  });
}

// Approve an OLD class request that has no start time: the admin picks the time here.
// The server then creates the class and its first month of sessions, like the Add class page.
function openApprove(r) {
  const d = r.details;
  const days = ADMIN_DAYS.filter(([code]) => (d.days || []).includes(code)).map(([, label]) => label).join(' & ');
  const total = d.per_week === 2 ? 8 : 4;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <form class="modal" id="fApprove" style="max-width:420px;text-align:left">
      <h2 class="modal-title">${icon('check')} Approve & publish</h2>
      <p class="muted" style="margin-top:0">${esc(days)} · ${total} sessions this month (${d.people === 1 ? '60' : '40'} min each)</p>
      <div class="field"><label for="apTime">Start time (Malaysia time)</label>
        <input id="apTime" name="start_time" type="time" required value="17:00"></div>
      <p class="muted" id="apPreview" style="margin:6px 0 0"></p>
      <p data-msg class="error"></p>
      <div class="row" style="margin-top:12px">
        <button type="submit">Publish class</button>
        <button type="button" class="secondary" data-close>Cancel</button>
      </div>
    </form>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector('[data-close]').onclick = close;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });

  // Show the first lesson so the admin can check the time before publishing
  const time = wrap.querySelector('#apTime');
  const preview = () => {
    const codes = ADMIN_DAYS.map(([c]) => c).filter((c) => (d.days || []).includes(c));
    if (!time.value || !codes.length) { $('#apPreview').textContent = ''; return; }
    const [first] = scheduleStarts(codes, time.value, total);
    $('#apPreview').textContent = `First session: ${fmtTime(new Date(first).toISOString())}`;
  };
  time.addEventListener('input', preview);
  preview();
  time.focus();

  bindForm('#fApprove', async (data) => {
    const res = await api(`/admin/class-requests/${r.id}/approve`, { body: { start_time: data.start_time } });
    close();
    toast(res.message);
    admin('requests');
  });
}

// ---------- Users ----------
function adminUsers() {
  $('#app').innerHTML = `
    ${adminHeader('users')}
    <form id="fUsers" class="panel search-bar"><input name="q" class="inline-input" placeholder="Search username or email" aria-label="Search users"><button type="submit">Search</button></form>
    <div id="userList" class="card table-card"></div>`;
  const loadUsers = async (q) => {
    const { users } = await api(`/admin/users?q=${encodeURIComponent(q)}`);
    if (!users.length) {
      $('#userList').innerHTML = '<div class="empty-state"><h3>No users found</h3><p class="muted">Try another name or email.</p></div>';
      return;
    }
    $('#userList').innerHTML = `<table class="stack"><thead><tr><th>User</th><th class="hide-sm">ID</th><th>Role</th></tr></thead><tbody>
      ${users.map((u) => `<tr><td data-label="User"><div class="user-cell"><span class="avatar" aria-hidden="true">${esc(initials(u.username))}</span><div><strong>${esc(u.username)}</strong><div class="muted">${esc(u.email)}</div></div></div></td>
        <td class="muted hide-sm" style="font-size:12px">${esc(u.id)}</td>
        <td data-label="Role"><select data-role="${esc(u.id)}" aria-label="Role of ${esc(u.username)}">${['student', 'coach', 'admin'].map((r) => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td></tr>`).join('')}
      </tbody></table>`;
    document.querySelectorAll('[data-role]').forEach((sel) => {
      sel.dataset.prev = sel.value;
      sel.onchange = async () => {
        try {
          await api(`/admin/users/${sel.dataset.role}/role`, { method: 'PUT', body: { role: sel.value } });
          sel.dataset.prev = sel.value;
          toast('Role updated');
        } catch (err) {
          sel.value = sel.dataset.prev; // the change was refused: show the real role again
          toast(err.message);
        }
      };
    });
  };
  $('#fUsers').addEventListener('submit', (e) => { e.preventDefault(); loadUsers(e.target.q.value.trim()); });
  loadUsers('');
}

// ---------- Price list ----------
async function adminPrices() {
  $('#app').innerHTML = `
    ${adminHeader('prices')}
    <form id="fPrices" class="panel admin-form">
      ${formTitle('tag', 'Package prices', 'Price per person in RM. Group classes are charged at the 4–6 people price.')}
      <div class="table-card inner">
        <table class="price-table">
          <thead><tr><th>Package</th><th>1 person</th><th>2 people</th><th>3 people</th><th>4–6 people</th></tr></thead>
          <tbody>
            ${[['weekdays', 4, 'Weekdays · once a week · 4 classes'], ['weekdays', 8, 'Weekdays · twice a week · 8 classes'],
               ['weekends', 4, 'Weekends · once a week · 4 classes'], ['weekends', 8, 'Weekends · twice a week · 8 classes']]
              .map(([g, n, label]) => `<tr><td>${label}</td>${['1', '2', '3', '4-6']
                .map((t) => `<td><input name="${g}|${n}|${t}" type="number" min="0" step="0.01" required style="width:130px;min-width:130px"></td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p data-msg class="error"></p>
      <button type="submit">Save prices</button>
    </form>`;
  bindForm('#fPrices', async (d) => {
    const plans = Object.entries(d).map(([key, val]) => {
      const [day_group, classes_per_month, group_tier] = key.split('|');
      return { day_group, classes_per_month: Number(classes_per_month), group_tier, rm: Number(val) };
    });
    await api('/admin/price-plans', { method: 'PUT', body: { plans } });
    state.plans = null; // the add-class price box reloads the new prices
    return 'Prices saved. New prices apply to new classes and sign-ups.';
  });
  api('/admin/price-plans').then(({ plans }) => {
    const form = $('#fPrices');
    for (const p of plans) {
      const el = form.querySelector(`[name="${p.day_group}|${p.classes_per_month}|${p.group_tier}"]`);
      if (el) el.value = (p.price_cents / 100).toFixed(2);
    }
  }).catch((err) => {
    console.error('[admin] could not load the price list:', err);
    toast(`Could not load the current prices: ${err.message}`);
  });
}

// ---------- Chat & request limits ----------
function adminSettings() {
  $('#app').innerHTML = `
    ${adminHeader('settings')}
    <div class="settings-grid">
      <form id="fChat" class="panel admin-form">
        ${formTitle('inbox', 'Condo chat', 'Old messages are deleted automatically.')}
        <div class="field"><label for="retention">Delete messages after (days)</label>
          <input id="retention" name="days" type="number" min="1" max="365" required></div>
        <p data-msg class="error"></p>
        <button type="submit">Save</button>
      </form>
      <form id="fReq" class="panel admin-form">
        ${formTitle('sliders', 'Class request limits', 'Stops one student from sending too many requests.')}
        <div class="row">
          <div class="field spacer"><label for="reqLimit">Max waiting requests per student</label>
            <input id="reqLimit" name="limit" type="number" min="1" max="20" required></div>
          <div class="field spacer"><label for="reqDays">Try again after a decline (days)</label>
            <input id="reqDays" name="days" type="number" min="1" max="365" required></div>
        </div>
        <p data-msg class="error"></p>
        <button type="submit">Save</button>
      </form>
    </div>`;
  bindForm('#fChat', async (d) => {
    await api('/admin/settings/chat-retention', { method: 'PUT', body: { days: Number(d.days) } });
    return 'Saved. Messages older than this are deleted automatically.';
  });
  bindForm('#fReq', async (d) => {
    await api('/admin/settings/class-requests', { method: 'PUT', body: { limit: Number(d.limit), days: Number(d.days) } });
    return 'Saved. New limits apply to the next requests.';
  });
  api('/admin/settings').then((s) => {
    $('#retention').value = s.chat_retention_days;
    $('#reqLimit').value = s.class_request_limit;
    $('#reqDays').value = s.class_request_wait_days;
  }).catch((err) => {
    console.error('[admin] could not load the settings:', err);
    toast(`Could not load the current settings: ${err.message}`);
  });
}

// ---------- Low ratings ----------
async function adminRatings() {
  const { ratings } = await api('/admin/ratings?max_stars=2');
  $('#app').innerHTML = `
    ${adminHeader('ratings')}
    ${ratings.length ? `<div class="rating-list">${ratings.map((r) => `
      <div class="card rating-row">
        <span class="avatar" aria-hidden="true">${esc(initials(r.participant_name))}</span>
        <div class="spacer">
          <div class="rating-top"><strong>${esc(r.participant_name)}</strong><span class="stars" aria-label="${r.stars} of 5 stars">${'★'.repeat(r.stars)}<span>${'★'.repeat(5 - r.stars)}</span></span></div>
          <div class="muted small">${esc(r.class_name)} · coach ${esc(r.coach_name)} · ${esc(fmtTime(r.created_at))}</div>
          ${r.reason ? `<p class="rating-reason">“${esc(r.reason)}”</p>` : ''}
        </div>
      </div>`).join('')}</div>`
      : '<div class="empty-state"><h3>No low ratings</h3><p class="muted">Students rated 2 stars or less by a coach appear here.</p></div>'}`;
}
