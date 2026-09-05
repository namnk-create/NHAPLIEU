/* =========================================================================
 * BẢN VÁ v2: parseTSVToTable — dán clipboard Excel không bị vỡ dòng
 * -------------------------------------------------------------------------
 * Thay thế NGUYÊN hàm parseTSVToTable cũ trong INDEX_HTML (phần util.js).
 *
 * Lỗi đã sửa:
 *  1. Dấu " lẻ giữa ô (VD: SIZE 5" TEXTURED) làm parser cũ bật chế độ quote,
 *     nuốt hết Tab/xuống dòng tới dấu " tiếp theo -> lệch toàn bộ sheet.
 *     Nay: " chỉ mở ô khi đứng ở ĐẦU ô VÀ tồn tại dấu đóng hợp lệ phía sau
 *     (dấu " theo sau bởi Tab / xuống dòng / hết chuỗi).
 *  2. Ô có xuống dòng (Alt+Enter) không được bọc quote -> bị cắt thành dòng
 *     mới. Nay các dòng thiếu cột được GHÉP lại với dòng trước.
 *
 * LƯU Ý KHI DÁN VÀO FILE WORKER:
 *   INDEX_HTML là một chuỗi JS, nên hàm này cố tình KHÔNG dùng ký tự escape
 *   (\t, \n, \r, \") — thay bằng String.fromCharCode. Dán thẳng vào, không
 *   cần escape lại gì cả.
 * ========================================================================= */

function parseTSVToTable(text) {
  var TAB = String.fromCharCode(9);
  var NL  = String.fromCharCode(10);
  var CR  = String.fromCharCode(13);
  var Q   = String.fromCharCode(34);

  text = String(text == null ? '' : text).split(CR + NL).join(NL).split(CR).join(NL);

  // Có dấu đóng ô hợp lệ phía sau không? Nếu không -> dấu " đầu ô chỉ là ký tự thường.
  function hasProperClose(s, start) {
    for (var j = start; j < s.length; j++) {
      if (s[j] !== Q) continue;
      if (s[j + 1] === Q) { j++; continue; }        // "" -> quote thoát, bỏ qua
      var nx = s[j + 1];
      if (nx === undefined || nx === TAB || nx === NL) return true;
      return false;
    }
    return false;
  }

  // ---- Bước 1: tách thô thành ma trận ----
  var rows = [], row = [], field = '', inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQ) {
      if (c === Q) {
        if (text[i + 1] === Q) { field += Q; i++; }            // "" -> một dấu "
        else {
          var nx = text[i + 1];
          if (nx === undefined || nx === TAB || nx === NL) inQ = false;   // đóng ô
          else field += Q;                                      // quote lẻ -> ký tự thường
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

  // ---- Bước 2: ghép các dòng bị vỡ (ô chứa xuống dòng không được bọc quote) ----
  var width = rows[0].length;          // số cột chuẩn = số cột dòng tiêu đề
  var fixed = [];
  var repaired = 0;
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

  // ---- Bước 3: chuẩn hoá số cột ----
  var headers = fixed[0].map(function (h) { return (h == null ? '' : h).toString().trim(); });
  var body = fixed.slice(1);
  var w = headers.length;
  for (var b = 0; b < body.length; b++) if (body[b].length > w) w = body[b].length;
  while (headers.length < w) headers.push('');
  for (var b2 = 0; b2 < body.length; b2++) { while (body[b2].length < w) body[b2].push(''); }

  // số dòng vẫn lệch cột so với tiêu đề (để cảnh báo ở Bảng 1)
  var suspect = 0;
  for (var s = 0; s < fixed.length; s++) if (fixed[s].length !== width) suspect++;

  return { headers: headers, rows: body, repaired: repaired, suspect: suspect };
}
