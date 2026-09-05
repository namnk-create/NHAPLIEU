/* =========================================================================
 * BẢN VÁ HỆ THỐNG XỬ LÝ DỮ LIỆU HÀNG HOÁ
 * Phiên bản đích: 2026.09.05-1 · TSVFIX
 * -------------------------------------------------------------------------
 * Gồm 6 thay đổi, đánh số [1]..[6]. Làm lần lượt từ trên xuống.
 *
 * LỖI ĐƯỢC SỬA
 *   Dán sheet vào Bảng 1 -> từ dòng 38 trở đi vỡ hết. Nguyên nhân: ô BO dòng
 *   37 chứa dấu nháy kép chỉ inch (SHIPPING SAMPLE ... 5" TEXTURED ...).
 *   Parser cũ gặp " la bat che do quote, nuot Tab va xuong dong cho toi dau "
 *   tiep theo -> toan bo phan sau don vao mot o.
 *
 * LƯU Ý CHUNG
 *   INDEX_HTML la mot chuoi JS. Cac doan code duoi day co tinh KHONG dung
 *   ky tu escape (\t \n \r \") ma thay bang String.fromCharCode, nen dan
 *   thang vao chuoi, khong can escape lai.
 * ========================================================================= */


/* =========================================================================
 * [1] ĐẦU FILE WORKER
 *     Tim:   const APP_VERSION = 'NODB-VN'
 *     Thay bang dong duoi. Quy uoc: YYYY.MM.DD-n · MO-TA-NGAN
 * ========================================================================= */

const APP_VERSION = '2026.09.05-1 · TSVFIX';


/* =========================================================================
 * [2] TRONG INDEX_HTML — phan util.js
 *     Tim:   function parseTSVToTable(text) {
 *     Thay NGUYEN ham cu bang ham duoi day.
 *
 *     Sua 2 loi:
 *       a) Dau " le giua o khong con bat che do quote. Chi mo o khi " dung
 *          o DAU o VA co dau dong hop le phia sau (dau " theo sau boi Tab /
 *          xuong dong / het chuoi).
 *       b) O co xuong dong (Alt+Enter) khong duoc boc quote -> dong bi vo
 *          nay duoc GHEP lai voi dong truoc.
 *
 *     Tra ve them 2 truong: repaired (so dong da ghep), suspect (so dong
 *     con lech cot) de canh bao o Bang 1.
 * ========================================================================= */

function parseTSVToTable(text) {
  var TAB = String.fromCharCode(9);
  var NL  = String.fromCharCode(10);
  var CR  = String.fromCharCode(13);
  var Q   = String.fromCharCode(34);

  text = String(text == null ? '' : text).split(CR + NL).join(NL).split(CR).join(NL);

  // Co dau dong o hop le phia sau khong? Neu khong -> dau " dau o chi la ky tu thuong.
  function hasProperClose(s, start) {
    for (var j = start; j < s.length; j++) {
      if (s[j] !== Q) continue;
      if (s[j + 1] === Q) { j++; continue; }          // "" -> quote thoat, bo qua
      var nx = s[j + 1];
      if (nx === undefined || nx === TAB || nx === NL) return true;
      return false;
    }
    return false;
  }

  // ---- Buoc 1: tach tho thanh ma tran ----
  var rows = [], row = [], field = '', inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQ) {
      if (c === Q) {
        if (text[i + 1] === Q) { field += Q; i++; }             // "" -> mot dau "
        else {
          var nx = text[i + 1];
          if (nx === undefined || nx === TAB || nx === NL) inQ = false;   // dong o
          else field += Q;                                       // quote le -> ky tu thuong
        }
      } else field += c;
    } else {
      if (c === Q && field === '' && hasProperClose(text, i + 1)) inQ = true;
      else if (c === TAB) { row.push(field); field = ''; }
      else if (c === NL)  { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  if (!rows.length) return null;

  // ---- Buoc 2: ghep cac dong bi vo ----
  var width = rows[0].length;            // so cot chuan = so cot dong tieu de
  var fixed = [], repaired = 0;
  for (var r = 0; r < rows.length; r++) {
    var cur = rows[r];
    var prev = fixed.length ? fixed[fixed.length - 1] : null;
    if (prev && prev.length < width && cur.length < width) {
      prev[prev.length - 1] += NL + (cur[0] == null ? '' : cur[0]);
      for (var k = 1; k < cur.length; k++) prev.push(cur[k]);
      repaired++;
      continue;
    }
    fixed.push(cur.slice());
  }

  // ---- Buoc 3: chuan hoa so cot ----
  var headers = fixed[0].map(function (h) { return (h == null ? '' : h).toString().trim(); });
  var body = fixed.slice(1);
  var w = headers.length;
  for (var b = 0; b < body.length; b++) if (body[b].length > w) w = body[b].length;
  while (headers.length < w) headers.push('');
  for (var b2 = 0; b2 < body.length; b2++) { while (body[b2].length < w) body[b2].push(''); }

  var suspect = 0;
  for (var s = 0; s < fixed.length; s++) if (fixed[s].length !== width) suspect++;

  return { headers: headers, rows: body, repaired: repaired, suspect: suspect };
}


/* =========================================================================
 * [3] TRONG INDEX_HTML — tabInput.js, handler paste cua pasteBox
 *     Tim khoi bat dau bang:  let msg = '✓ Đã nạp ' + data.rows.length ...
 *     Chen 2 dong duoi NGAY SAU dong do (truoc dong flash1.innerHTML = ...)
 * ========================================================================= */

// if (data.repaired) msg += ' · đã ghép ' + data.repaired + ' dòng bị vỡ';
// if (data.suspect)  msg += ' · ⚠ ' + data.suspect + ' dòng lệch cột, nên kiểm lại';


/* =========================================================================
 * [4] TRONG INDEX_HTML — ngay sau dong mo IIFE:  (function(){
 *     Dan nguyen 1 dong duoi. Dau __APP_VERSION__ se duoc worker thay o [6].
 *     CHU Y: chuoi '__APP_VERSION__' chi duoc xuat hien DUNG MOT LAN trong
 *     toan bo INDEX_HTML.
 * ========================================================================= */

var BUILD_VERSION = '__APP_VERSION__';   // version cua TRANG dang mo


/* =========================================================================
 * [5] TRONG INDEX_HTML — phan app.js
 *     Thay NGUYEN ham enterApp() cu, va them 2 ham moi ben duoi.
 *     Muc dich: nhin goc phai topbar la biet trang dang mo co phai ban moi
 *     nhat khong. Neu server da deploy ban moi -> hien thanh do nhac tai lai.
 * ========================================================================= */

function enterApp() {
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');

  var pageVer = (BUILD_VERSION.indexOf('__APP') === 0) ? 'LOCAL' : BUILD_VERSION;
  $('#who').innerHTML = esc(State.user.name) + ' (' + roleLabel(State.user) + ')' +
    '<span class="ver-tag" id="ver-tag" title="Phien ban TRANG dang mo">v: ' + esc(pageVer) + '</span>';

  applyPermissions();
  buildAllTabs();
  showTabs();
  startVersionWatch();
}

function startVersionWatch() {
  if (State.mode !== 'api') return;
  if (BUILD_VERSION.indexOf('__APP') === 0) return;   // chay local, khong co version nhung

  var shown = false;
  async function check() {
    try {
      var r = await fetch('/api/version', { cache: 'no-store' }).then(function (x) { return x.json(); });
      if (!r || !r.ok || !r.version) return;
      var tag = document.getElementById('ver-tag');
      if (r.version === BUILD_VERSION) {
        if (tag) { tag.style.color = '#9db3cf'; tag.title = 'Dang chay ban moi nhat'; }
        return;
      }
      if (tag) { tag.style.color = '#ffd166'; tag.title = 'Server dang o ban ' + r.version; }
      if (shown) return;
      shown = true;
      showUpdateBar(r.version);
    } catch (e) {}
  }
  check();
  setInterval(check, 120000);            // kiem tra moi 2 phut
  window.addEventListener('focus', check);
}

function showUpdateBar(serverVer) {
  var bar = el('div', {
    style: 'position:fixed;left:0;right:0;bottom:0;z-index:400;background:#b4231f;color:#fff;' +
           'padding:10px 16px;display:flex;align-items:center;gap:12px;font-size:13px;' +
           'box-shadow:0 -2px 12px rgba(0,0,0,.25)'
  }, [
    el('b', { text: 'Da co ban moi: ' + serverVer }),
    el('span', { style: 'opacity:.85', text: 'Trang ban dang mo la ban ' + BUILD_VERSION + '. Tai lai de dung ban moi nhat.' }),
    el('div', { style: 'flex:1' }),
    el('button', {
      class: 'btn btn-sm', style: 'background:#fff;color:#b4231f;border-color:#fff;font-weight:700',
      text: 'Tai lai ngay', onclick: function () { location.reload(true); }
    }),
    el('button', {
      class: 'btn btn-sm btn-ghost', text: 'De sau',
      onclick: function (ev) { ev.target.closest('div').remove(); }
    }),
  ]);
  document.body.appendChild(bar);
}


/* =========================================================================
 * [6] CUOI FILE WORKER — trong export default { async fetch(...) }
 *     Tim dong cuoi:
 *       return new Response(INDEX_HTML, { status: 200, headers: { ... } });
 *     Thay bang:
 * ========================================================================= */

// return new Response(
//   INDEX_HTML.split('__APP_VERSION__').join(APP_VERSION),
//   { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
// );


/* =========================================================================
 * KIEM TRA SAU KHI DEPLOY
 *  1. Goc phai topbar hien: v: 2026.09.05-1 · TSVFIX  (mau xam nhat)
 *  2. Dan lai dung sheet cu vao Bang 1. Kiem dong 37 (SF5152440423983):
 *       BO = SHIPPING SAMPLE – NO523215MN 5" TEXTURED VOLLEY MEN SHORT ...
 *       BP = 6    BQ = PCS    BR = 6.000    BS = 36
 *  3. Tong so dong o Bang 2 phai bang dung so dong da copy tu Excel.
 * ========================================================================= */
