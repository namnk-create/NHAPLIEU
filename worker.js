/*
 * CLOUDFLARE WORKER (kèm static assets)
 * - /api/*  -> xử lý API (đăng nhập, rule, dữ liệu) trên D1
 * - còn lại -> phục vụ file tĩnh trong thư mục public/ (index.html)
 * Binding cần có: DB (D1 database), ASSETS (static assets - khai trong wrangler.toml)
 */

const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function hashPassword(plain, saltBytes) {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMat, 256);
  const toHex = a => Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
  return toHex(salt) + ':' + toHex(new Uint8Array(bits));
}
async function verifyPassword(plain, stored) {
  if (!stored || !stored.includes(':')) return false;
  const salt = new Uint8Array(stored.split(':')[0].match(/.{2}/g).map(h => parseInt(h, 16)));
  return (await hashPassword(plain, salt)) === stored;
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, pass_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor', can_edit INTEGER DEFAULT 1, can_report INTEGER DEFAULT 0,
      must_change INTEGER DEFAULT 1, active INTEGER DEFAULT 1, created_at INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS rules_kv (k TEXT PRIMARY KEY, json TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS dict_kv (k TEXT PRIMARY KEY, json TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS daily_data (uniq_key TEXT PRIMARY KEY, biz_date TEXT, awb_no TEXT,
      data_json TEXT, updated_by TEXT, updated_at INTEGER)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT, expires INTEGER)`),
  ]);
}

async function currentUser(db, request) {
  const token = request.headers.get('x-auth-token');
  if (!token) return null;
  const s = await db.prepare('SELECT * FROM sessions WHERE token=?').bind(token).first();
  if (!s || (s.expires && s.expires < Date.now())) return null;
  const u = await db.prepare('SELECT * FROM users WHERE id=?').bind(s.user_id).first();
  return u && u.active ? u : null;
}
const pub = u => ({ id: u.id, name: u.name, role: u.role, canEdit: !!u.can_edit, canReport: !!u.can_report, mustChange: !!u.must_change, active: !!u.active });

async function handleApi(request, env, url) {
  const db = env.DB;
  if (!db) return J({ ok: false, msg: 'Chưa gắn D1 binding tên DB (kiểm tra wrangler.toml hoặc Settings > Bindings).' }, 500);

  const seg = url.pathname.replace(/^\/api/, '').split('/').filter(Boolean);
  const route = '/' + seg.join('/');
  const method = request.method;

  try {
    await ensureSchema(db);

    if (route === '/ping') return J({ ok: true, mode: 'api' });

    if (route === '/login' && method === 'POST') {
      const cnt = await db.prepare('SELECT COUNT(*) AS n FROM users').first();
      if (!cnt.n) { const h = await hashPassword('admin');
        await db.prepare('INSERT INTO users (id,name,pass_hash,role,can_edit,can_report,must_change,active,created_at) VALUES (?,?,?,?,1,1,1,1,?)')
          .bind('admin', 'Quản trị viên', h, 'admin', Date.now()).run(); }
      const { id, pass } = await request.json();
      const u = await db.prepare('SELECT * FROM users WHERE lower(id)=lower(?)').bind(id).first();
      if (!u || !u.active) return J({ ok: false, msg: 'Tài khoản không tồn tại hoặc đã bị khoá.' }, 401);
      if (!(await verifyPassword(pass, u.pass_hash))) return J({ ok: false, msg: 'Sai mật khẩu.' }, 401);
      const token = crypto.randomUUID();
      await db.prepare('INSERT INTO sessions (token,user_id,expires) VALUES (?,?,?)').bind(token, u.id, Date.now() + 12 * 3600 * 1000).run();
      return J({ ok: true, token, user: pub(u), mustChange: !!u.must_change });
    }

    const me = await currentUser(db, request);
    if (route === '/me') return me ? J({ ok: true, user: pub(me), mustChange: !!me.must_change }) : J({ ok: false }, 401);
    if (!me) return J({ ok: false, msg: 'Chưa đăng nhập.' }, 401);

    if (route === '/logout' && method === 'POST') {
      const token = request.headers.get('x-auth-token');
      if (token) await db.prepare('DELETE FROM sessions WHERE token=?').bind(token).run();
      return J({ ok: true });
    }
    if (route === '/change-password' && method === 'POST') {
      const { id, newPass } = await request.json();
      if (me.role !== 'admin' && me.id !== id) return J({ ok: false, msg: 'Không có quyền.' }, 403);
      await db.prepare('UPDATE users SET pass_hash=?, must_change=0 WHERE id=?').bind(await hashPassword(newPass), id).run();
      return J({ ok: true });
    }
    if (route === '/rules' && method === 'GET') {
      const { results } = await db.prepare('SELECT k,json FROM rules_kv').all();
      const out = {}; results.forEach(r => out[r.k] = JSON.parse(r.json));
      return J({ ok: true, rules: Object.keys(out).length ? out : null });
    }
    if (route === '/rules' && method === 'PUT') {
      if (!me.can_edit && me.role !== 'admin') return J({ ok: false, msg: 'Không có quyền.' }, 403);
      const { rules } = await request.json();
      await db.batch(Object.entries(rules).map(([k, v]) => db.prepare('INSERT INTO rules_kv (k,json) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET json=excluded.json').bind(k, JSON.stringify(v))));
      return J({ ok: true });
    }
    if (route === '/dict' && method === 'GET') {
      const row = await db.prepare('SELECT json FROM dict_kv WHERE k=?').bind('dict').first();
      return J({ ok: true, dict: row ? JSON.parse(row.json) : null });
    }
    if (route === '/dict' && method === 'PUT') {
      if (!me.can_edit && me.role !== 'admin') return J({ ok: false, msg: 'Không có quyền.' }, 403);
      const { dict } = await request.json();
      await db.prepare('INSERT INTO dict_kv (k,json) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET json=excluded.json').bind('dict', JSON.stringify(dict)).run();
      return J({ ok: true });
    }
    if (route === '/users' && method === 'GET') {
      if (me.role !== 'admin') return J({ ok: false, msg: 'Không có quyền.' }, 403);
      const { results } = await db.prepare('SELECT * FROM users').all();
      return J({ ok: true, users: results.map(pub) });
    }
    if (route === '/users' && method === 'POST') {
      if (me.role !== 'admin') return J({ ok: false, msg: 'Không có quyền.' }, 403);
      const { user, plainPass } = await request.json();
      const ex = await db.prepare('SELECT id FROM users WHERE lower(id)=lower(?)').bind(user.id).first();
      if (!ex) {
        await db.prepare('INSERT INTO users (id,name,pass_hash,role,can_edit,can_report,must_change,active,created_at) VALUES (?,?,?,?,?,?,1,?,?)')
          .bind(user.id, user.name, await hashPassword(plainPass || '123456'), user.role, user.canEdit ? 1 : 0, user.canReport ? 1 : 0, user.active ? 1 : 0, Date.now()).run();
      } else {
        await db.prepare('UPDATE users SET name=?, role=?, can_edit=?, can_report=?, active=? WHERE id=?')
          .bind(user.name, user.role, user.canEdit ? 1 : 0, user.canReport ? 1 : 0, user.active ? 1 : 0, ex.id).run();
        if (plainPass) await db.prepare('UPDATE users SET pass_hash=?, must_change=1 WHERE id=?').bind(await hashPassword(plainPass), ex.id).run();
      }
      return J({ ok: true });
    }
    if (route.startsWith('/users/') && route.endsWith('/reset') && method === 'POST') {
      if (me.role !== 'admin') return J({ ok: false, msg: 'Không có quyền.' }, 403);
      await db.prepare('UPDATE users SET pass_hash=?, must_change=1 WHERE id=?').bind(await hashPassword('123456'), decodeURIComponent(seg[1])).run();
      return J({ ok: true });
    }
    if (route.startsWith('/users/') && method === 'DELETE') {
      if (me.role !== 'admin') return J({ ok: false, msg: 'Không có quyền.' }, 403);
      const id = decodeURIComponent(seg[1]);
      if (id === 'admin') return J({ ok: false, msg: 'Không xoá được admin.' }, 400);
      await db.prepare('DELETE FROM users WHERE id=?').bind(id).run();
      return J({ ok: true });
    }
    if (route === '/key-exists' && method === 'GET') {
      const today = new Date().toISOString().slice(0, 10);
      const row = await db.prepare('SELECT 1 FROM daily_data WHERE uniq_key=?').bind(today + '::' + url.searchParams.get('key')).first();
      return J({ ok: true, exists: !!row });
    }
    if (route === '/keys' && method === 'GET') {
      const today = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      const { results } = await db.prepare('SELECT awb_no FROM daily_data WHERE biz_date=?').bind(today).all();
      return J({ ok: true, keys: results.map(r => r.awb_no) });
    }
    if (route === '/manifest' && method === 'POST') {
      if (!me.can_edit && me.role !== 'admin') return J({ ok: false, msg: 'Không có quyền.' }, 403);
      const { rows, keyColIndex } = await request.json();
      const today = new Date().toISOString().slice(0, 10);
      const stmts = [];
      for (const row of rows) {
        const awb = String(row[keyColIndex] ?? '').trim(); if (!awb) continue;
        stmts.push(db.prepare('INSERT INTO daily_data (uniq_key,biz_date,awb_no,data_json,updated_by,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(uniq_key) DO UPDATE SET data_json=excluded.data_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at')
          .bind(today + '::' + awb, today, awb, JSON.stringify(row), me.id, Date.now()));
      }
      for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40));
      return J({ ok: true, added: stmts.length });
    }
    if (route === '/report' && method === 'GET') {
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      const { results } = await db.prepare('SELECT data_json FROM daily_data WHERE biz_date=?').bind(date).all();
      return J({ ok: true, rows: results.map(r => JSON.parse(r.data_json)) });
    }

    return J({ ok: false, msg: 'Not found: ' + route }, 404);
  } catch (e) {
    return J({ ok: false, msg: String(e && e.message || e) }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(request, env, url);
    // phục vụ file tĩnh (index.html...)
    return env.ASSETS.fetch(request);
  }
};
