# Hướng dẫn cập nhật tab "Kéo MEC" (Bảng 3 / Bảng 4)

Tài liệu này liệt kê từng thay đổi cần làm trong file worker.js hiện có của bạn. Mỗi mục có:
- **Vị trí**: tìm bằng từ khóa ASCII (tên hàm/biến) để không lệch vì file gốc mã hoá tiếng Việt dạng `\uXXXX`.
- **Thao tác**: thêm mới / thay thế nguyên đoạn.

Bạn có thể dán code Vietnamese thường (không cần escape `\uXXXX`) — JS chạy y hệt, chỉ khác cách lưu trong source.

---

## 1. Bảng 3 (Chi tiết bảng kê MEC): thêm nút "x" xoá khẩn cấp + ghi UNEXPORTED

**Vị trí**: trong hàm `renderMecTab`, ngay sau đoạn gán `M2._asIdx = asIdx; M2._atIdx = atIdx; M2._auIdx = auIdx; M2._cityByBill = cityByBill;` (cuối hàm `buildTable2`, trước dòng `renderTable2();`).

**Thêm** ngay sau dòng đó (trước `renderTable2();`):

```js
    M2.rowAction = canEdit ? ((ri) => deleteMecRow(ri)) : null;
    M2.rowActionDir = 'del';
    M2.rowActionLabel = '✕';
    M2.rowActionTitle = 'Xoá khẩn cấp dòng này (ghi UNEXPORTED, không đưa vào file xuất)';
```

**Thêm hàm mới** (đặt ở bất kỳ đâu trong `renderMecTab`, ví dụ ngay trước `function renderTable2() {`):

```js
  // Xoá khẩn cấp 1 dòng khỏi Bảng 3 — bắt buộc nhập lý do, Enter = OK cho nhanh.
  // Dòng bị xoá sẽ KHÔNG được xuất trong lần Xuất MEC này, và được ghi nhận "unexported"
  // để có thể chuyển lô này sang xuất ở chuyến bay/MAWB khác sau này.
  function deleteMecRow(ri) {
    const row = M2.rows[ri]; if (!row) return;
    const bill = String(row[3] ?? '').trim();   // cột D (BILL) trong file MEC
    promptReasonMec('Nhập LÝ DO xoá khẩn cấp dòng ' + (bill || '(không rõ bill)') + ' — Enter để xác nhận nhanh', async (reason) => {
      M2.rows.splice(ri, 1);
      // loại khỏi thống kê lô mẹ (nếu đây là bill mẹ)
      const mi = mecLots.findIndex(l => String(l.master).toUpperCase() === bill.toUpperCase());
      if (mi >= 0) mecLots.splice(mi, 1);
      // loại khỏi danh sách sẽ bị đánh dấu "exported" khi bấm Xuất MEC
      allScannedBills = (allScannedBills || []).filter(b => String(b).trim().toUpperCase() !== bill.toUpperCase());
      try {
        await Store.markUnexported([{ bill, reason, time: new Date().toISOString().replace('T', ' ').slice(0, 19) }]);
      } catch (e) { toast('Đã xoá khỏi Bảng 3 nhưng lỗi ghi log unexported', 'warn'); }
      renderTable2();
      updateBag4();
      toast('Đã xoá "' + bill + '" — ghi UNEXPORTED. Lô này có thể xuất ở chuyến bay khác.', 'warn', 4500);
    });
  }

  // Hộp nhập lý do dùng riêng cho Bảng 3: Enter trong ô input = coi như bấm OK.
  function promptReasonMec(title, onOk) {
    const inp = el('input', { class: 'inp', placeholder: 'Nhập lý do…' });
    const box = el('div', {}, [el('label', { class: 'fld' }, [el('span', { text: title }), inp])]);
    const closeFn = modal({
      title: 'Xác nhận xoá khẩn cấp', bodyNode: box,
      actions: [
        { label: 'Huỷ' },
        { label: 'OK — Xác nhận', cls: 'btn-danger', onClick: (c) => {
          const v = inp.value.trim();
          if (!v) { toast('Vui lòng nhập lý do', 'warn'); return; }
          c(); onOk(v);
        }},
      ]
    });
    setTimeout(() => inp.focus(), 50);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = inp.value.trim();
        if (!v) { toast('Vui lòng nhập lý do', 'warn'); return; }
        closeFn(); onOk(v);
      }
    });
  }
```

> Ghi chú: `modal(...)` trong `util.js` đã `return close;` sẵn nên `closeFn()` dùng được ngay, không cần sửa `modal()`.

---

## 2. Bảng 4 (Bag/Cage/Car): thêm cột "Air Pcs" + dòng Total

**Vị trí**: trong hàm `updateBag4()`, tìm đoạn có `Array.from(bags.entries())`.

**Thay nguyên khối này**:

```js
    bagBody.appendChild(el('div', { class: 'desc', style: 'font-weight:600;margin:10px 0 4px;font-size:12px', text: 'Bag/Cage/Car → số waybill:' }));
    const t2 = el('table', { class: 'users', style: 'font-size:11.5px' });
    t2.appendChild(el('thead', {}, el('tr', {}, [el('th', { text: 'Bag/Cage/Car (C)' }), el('th', { text: 'Số waybill' })])));
    const tb2 = el('tbody');
    Array.from(bags.entries()).sort((a, b) => b[1].length - a[1].length).forEach(([bag, list]) => {
      tb2.appendChild(el('tr', {}, [el('td', { text: bag }), el('td', {}, el('b', { text: list.length }))]));
    });
    t2.appendChild(tb2); bagBody.appendChild(t2);
```

**Bằng**:

```js
    bagBody.appendChild(el('div', { class: 'desc', style: 'font-weight:600;margin:10px 0 4px;font-size:12px', text: 'Bag/Cage/Car → số waybill:' }));
    const t2 = el('table', { class: 'users', style: 'font-size:11.5px' });
    t2.appendChild(el('thead', {}, el('tr', {}, [el('th', { text: 'Bag/Cage/Car (C)' }), el('th', { text: 'Số waybill' }), el('th', { text: 'Air Pcs' })])));
    const tb2 = el('tbody');
    let totalAirPcs = 0;
    // Rule: mã bag/cage/car bắt đầu bằng "3" -> Air Pcs = số waybill trong bag đó.
    //       Bắt đầu bằng "6" -> Air Pcs = 1. Trường hợp khác -> để trống, không cộng vào Total.
    Array.from(bags.entries()).sort((a, b) => b[1].length - a[1].length).forEach(([bag, list]) => {
      const first = String(bag ?? '').trim().charAt(0);
      let airPcs = '';
      if (first === '3') airPcs = list.length;
      else if (first === '6') airPcs = 1;
      if (airPcs !== '') totalAirPcs += Number(airPcs);
      tb2.appendChild(el('tr', {}, [el('td', { text: bag }), el('td', {}, el('b', { text: list.length })), el('td', {}, el('b', { text: airPcs }))]));
    });
    tb2.appendChild(el('tr', { style: 'background:#eef3f8;font-weight:700' }, [
      el('td', { text: 'Total' }), el('td', { text: '' }), el('td', {}, el('b', { text: totalAirPcs })),
    ]));
    t2.appendChild(tb2); bagBody.appendChild(t2);
```

---

## 3. File "Xuất MEC" chính thức: bỏ 3 cột phụ (Ghi chú / ME-CON / Port) cuối bảng

Hiện tại nút "⬇ Extract" (`mec-extract`, xuất `_KIEM.xlsx`) là **file kiểm tra** — vẫn giữ đủ cột (kể cả 3 cột phụ) để soát trước khi xuất, không đổi.
Nút "✔ Tạo MEC" (`mec-create`) mới là **file MEC chính thức nộp hải quan** — cần bỏ 3 cột phụ cuối và đổi tên nút thành "Xuất MEC".

### 3.1. Thêm hàm xuất file chính thức

**Vị trí**: đặt ngay sau hàm `extractMec()` hiện có.

```js
  // File MEC CHÍNH THỨC (sau khi Check TK + Check MST xanh): KHÔNG có 3 cột phụ trợ cuối
  // (Ghi chú / ME-CON / Port) — chỉ đúng số cột theo chuẩn khai báo MEC gốc.
  function extractMecFinal() {
    if (!M2.rows.length) { toast('Chưa có dữ liệu', 'warn'); return; }
    const baseLen = M2._asIdx != null ? M2._asIdx : M2.headers.length;
    const headers = M2.headers.slice(0, baseLen);
    const rows = M2.rows.map(r => r.slice(0, baseLen));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MEC');
    XLSX.writeFile(wb, fileName() + '.xlsx');
  }
```

### 3.2. Dùng hàm này khi xác nhận xuất

**Vị trí**: trong `confirmExported()`, tìm dòng:

```js
          extractMec();   // tải file luôn
```

**Thay bằng**:

```js
          extractMecFinal();   // tải file MEC chính thức (đã bỏ 3 cột phụ AR/AS/AT)
```

### 3.3. Đổi nhãn nút thành "Xuất MEC"

**Vị trí A** — khai báo nút (trong khối `panel2.appendChild(el('div', { class: 'panel-head' ...`), tìm:

```js
    el('button', { class: 'btn btn-sm btn-primary', id: 'mec-create', style: 'padding:3px 10px;font-size:12px;opacity:.4;pointer-events:none', text: '✔ Tạo MEC', title: 'Cần Check TK + MST xanh trước', onclick: () => confirmExported() }),
```

**Thay `text: '✔ Tạo MEC'` thành**:

```js
    el('button', { class: 'btn btn-sm btn-primary', id: 'mec-create', style: 'padding:3px 10px;font-size:12px;opacity:.4;pointer-events:none', text: '✔ Xuất MEC', title: 'Cần Check TK + MST xanh trước', onclick: () => confirmExported() }),
```

**Vị trí B** — trong `updateMecGate()`, tìm:

```js
      cr.textContent = crOn ? '✔ Tạo MEC' : '🔍 Kiểm MEC';
```

**Thay bằng**:

```js
      cr.textContent = crOn ? '✔ Xuất MEC' : '🔍 Kiểm MEC';
```

(Tuỳ chọn, chỉ để đồng bộ chữ: trong `confirmExported()` có thể đổi tiêu đề modal `'Xác nhận tạo MEC'` → `'Xác nhận Xuất MEC'`.)

> Việc "Xuất MEC ghi nhận MAWB, ngày giờ xuất" đã có sẵn — `confirmExported()` gọi `Store.markExported(bills, selectedMawb, note, {..., biz_date: tb6.value})`, không cần sửa gì thêm.

---

## 4. Cố định chiều cao 1 màn hình + luôn có thanh cuộn cho Bảng 3 và Bảng 4

Bảng 3 (`panel2`/`m2body`) đã có sẵn CSS ép scroll:
`.mec-layout .mec-bottom2 .fillbody .grid-scroll{overflow:scroll !important;height:100%}` — không cần sửa.

Bảng 4 (`panelBag`/`bagBody`) hiện dùng `overflow:auto` (chỉ hiện thanh cuộn khi tràn) — cần đổi thành `scroll` để luôn hiện.

**Vị trí**: khai báo `bagBody`, tìm:

```js
  const bagBody = el('div', { class: 'panel-body', style: 'padding:8px;overflow:auto' }, [el('div', { class: 'muted', text: 'Chưa có dữ liệu. Đổ file R ra Bảng 3.' })]);
```

**Thay `overflow:auto` thành `overflow:scroll`**:

```js
  const bagBody = el('div', { class: 'panel-body', style: 'padding:8px;overflow:scroll' }, [el('div', { class: 'muted', text: 'Chưa có dữ liệu. Đổ file R ra Bảng 3.' })]);
```

Vì `bagBody` nằm trong `.mec-layout .mec-bottom2 .panel` (đã có `display:flex;flex-direction:column;min-height:0;overflow:hidden` và `.panel .panel-body{flex:1;min-height:0;...}`), nó đã tự động bị giới hạn đúng 1 khung hình cùng chiều cao với Bảng 3 — chỉ cần đổi `auto` → `scroll` là đủ.

---

## 5. Tự động co giãn độ rộng cột theo nội dung (autofit) cho Bảng 1 (MAWB) và Bảng 3 (MEC)

**Vị trí**: thêm hàm dùng chung, đặt ngay trong `renderMecTab` (trước `loadM1()` là được, vì cả hai chỗ dùng đều nằm trong hàm này):

```js
  // Co giãn độ rộng từng cột theo chuỗi dài nhất đang có trong cột đó (kiểu AutoFit của Excel),
  // luôn kẹp trong khoảng [min, max] để không bị quá hẹp hoặc quá rộng.
  function autoFitColW(headers, rows, opts) {
    const o = Object.assign({ min: 60, max: 320, charPx: 7.2, pad: 22 }, opts || {});
    return headers.map((h, ci) => {
      let maxLen = String(h ?? '').length;
      for (const r of rows) { const L = String(r[ci] ?? '').length; if (L > maxLen) maxLen = L; }
      const w = Math.round(maxLen * o.charPx) + o.pad;
      return Math.max(o.min, Math.min(o.max, w));
    });
  }
```

**Áp dụng cho Bảng 1 (MAWB)** — trong `loadM1()`, ngay sau dòng gán `M1.rows = visible.map(...)`, thêm:

```js
    M1.colW = autoFitColW(M1.headers, M1.rows, { max: 320 });
```

(đặt trước dòng `if (canEdit) M1.rows.push(['', '', '', '', '']);` hoặc sau đều được — chỉ cần chạy trước khi `renderM3()` dựng lại `DataGrid`.)

**Áp dụng cho Bảng 3 (MEC)** — trong `buildTable2()`, ngay sau dòng `M2.rows = rows.map(r => r.slice());`, thêm:

```js
    M2.colW = autoFitColW(headers, M2.rows, { max: 260 });
```

> Bảng "Bag/Cage/Car" (mục 2) dùng `<table class="users">` thông thường (không phải `DataGrid`), và CSS `.users` không đặt `table-layout:fixed`, nên trình duyệt đã tự co giãn cột theo nội dung sẵn — không cần sửa gì thêm cho bảng đó.

---

## Tóm tắt việc cần làm theo đúng yêu cầu của bạn

1. ✅ Bảng 3: NV chỉnh sửa data → nút Extract (kiểm tra, đủ cột kể cả AR/AS/AT) → qua Check TK/MST → nút đổi thành "Xuất MEC" → file MEC thật KHÔNG còn AR/AS/AT.
2. ✅ Bấm "Xuất MEC" → ghi exported cho các lô, ghi nhận MAWB + ngày giờ xuất (đã có sẵn logic, chỉ đổi tên nút + hàm export).
3. ✅ Bảng 3: thêm nút "✕" đầu mỗi dòng → bắt buộc nhập lý do (Enter = OK nhanh, hoặc bấm nút OK) → dòng đó không xuất, ghi "unexported", lô có thể chuyển xuất chuyến khác.
4. ✅ Bảng Bag/Cage/Car: thêm cột Air Pcs (rule đầu mã "3"→=cột B, "6"→=1) + dòng Total.
5. ✅ Bảng 1 (MAWB), Bảng 3 (MEC): tự co giãn độ rộng cột theo nội dung; Bag/Cage/Car vốn đã tự co giãn.
6. ✅ Bảng 3 (đã có sẵn) và Bảng 4: cố định 1 khung hình, luôn hiện thanh cuộn phải + dưới.
