async function syncWbQuoteLogFromPageToExtension() {
  try {
    const raw = localStorage.getItem("wb_quote_log");
    if (!raw) return;

    const newData = JSON.parse(raw);
    if (!Array.isArray(newData)) return;

    // ─── 既存の chrome.storage から isCreated をマージ ───
    const stored = await chrome.storage.local.get("wb_quote_log_cache");
    const existingRaw = stored?.wb_quote_log_cache || null;
    if (existingRaw) {
      try {
        const existingData = JSON.parse(existingRaw);
        if (Array.isArray(existingData)) {
          // today + time + cusId + caseName をキーに isCreated をマージ
          const createdSet = new Set(
            existingData
              .filter((item) => item.isCreated)
              .map(
                (item) =>
                  `${item.today}_${item.time}_${item.cusId}_${item.caseName}`,
              ),
          );
          // biome-ignore lint/complexity/noForEach: <explanation>
          newData.forEach((item) => {
            const key = `${item.today}_${item.time}_${item.cusId}_${item.caseName}`;
            if (createdSet.has(key)) {
              item.isCreated = true;
            }
          });
        }
      } catch {
        // マージ失敗時はそのまま保存
      }
    }
    // ─────────────────────────────────────────────────────

    await chrome.storage.local.set({
      wb_quote_log_cache: JSON.stringify(newData),
    });
    return;
  } catch (e) {
    console.warn("[flam-ext] sync失敗:", e);
  }
}

async function parseWbQuoteLog() {
  await syncWbQuoteLogFromPageToExtension();
  const stored = await chrome.storage.local.get("wb_quote_log_cache");
  const raw = stored?.wb_quote_log_cache || null;

  if (!raw) return [];

  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("[flam-ext] JSON parse failed:", e);
    return [];
  }
}

function ensureModalContainer() {
  // 既存があれば削除して作り直す
  const existing = document.getElementById("flam-wb-quote-modal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "flam-wb-quote-modal";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(0,0,0,0.3)",
    zIndex: "99999",
    display: "flex",
    alignItems: "flex-start", // 上寄せ
    justifyContent: "flex-end", // 右寄せ
    paddingTop: "60px", // ページ上部からの距離
    paddingRight: "16px", // 右からの距離
  });

  const box = document.createElement("div");
  Object.assign(box.style, {
    width: "800px",
    maxHeight: "80vh",
    background: "#fff",
    borderRadius: "4px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily: "sans-serif",
    fontSize: "13px",
  });

  const header = document.createElement("div");
  header.textContent = "見積計算履歴 から選択";
  Object.assign(header.style, {
    padding: "8px 12px",
    borderBottom: "1px solid #ddd",
    background: "#f5f5f5",
    fontWeight: "bold",
    display: "flex",
    justifyContent: "space-between",
    gap: "8px",
  });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "閉じる";
  closeBtn.type = "button";
  closeBtn.style.minWidth = "80px";

  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.id = "flam-wb-quote-modal-body";
  Object.assign(body.style, {
    padding: "8px 12px",
    overflow: "auto",
    flex: "1",
  });

  const footer = document.createElement("div");
  Object.assign(footer.style, {
    padding: "8px 12px",
    borderTop: "1px solid #ddd",
    display: "flex",
    justifyContent: "space-between",
    gap: "8px",
  });

  const applyBtn = document.createElement("button");
  applyBtn.textContent = "選択を転記";
  applyBtn.type = "button";
  applyBtn.style.minWidth = "100px";
  applyBtn.style.background = "#4caf50";
  applyBtn.style.color = "#fff";
  applyBtn.style.border = "none";
  applyBtn.style.cursor = "pointer";

  // ─── FLAM クリアボタン ───
  const clearFlamBtn = document.createElement("button");
  clearFlamBtn.textContent = "FLAM clear";
  clearFlamBtn.type = "button";
  Object.assign(clearFlamBtn.style, {
    minWidth: "100px",
    background: "#f44336",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    padding: "4px 8px",
  });

  clearFlamBtn.addEventListener("click", (e) =>clearFlamFields(e));
  // ────────────────────────

  footer.appendChild(applyBtn);
  footer.appendChild(clearFlamBtn);

  box.appendChild(header);
  box.appendChild(body);
  box.appendChild(footer);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  closeBtn.addEventListener("click", () => {
    overlay.remove();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.applyBtn = applyBtn;

  return overlay;
}

function renderPreviewTable(data, overlay) {
  const body = overlay.querySelector("#flam-wb-quote-modal-body");
  body.innerHTML = "";

  if (!data.length) {
    body.textContent = "見積計算履歴 にデータがありません。";
    return;
  }

  // ─── フィルター入力欄 ───
  const filterWrap = document.createElement("div");
  Object.assign(filterWrap.style, {
    marginBottom: "8px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  });

  const filterLabel = document.createElement("label");
  filterLabel.textContent = "顧客IDで絞り込み：";
  filterLabel.style.fontSize = "12px";

  const filterInput = document.createElement("input");
  filterInput.type = "text";
  filterInput.placeholder = "顧客IDを入力...";
  Object.assign(filterInput.style, {
    padding: "4px 6px",
    fontSize: "12px",
    border: "1px solid #ccc",
    borderRadius: "3px",
    width: "150px",
  });

  const clearBtn = document.createElement("button");
  clearBtn.textContent = "クリア";
  clearBtn.type = "button";
  Object.assign(clearBtn.style, {
    padding: "3px 8px",
    fontSize: "12px",
    cursor: "pointer",
  });

  filterWrap.appendChild(filterLabel);
  filterWrap.appendChild(filterInput);
  filterWrap.appendChild(clearBtn);
  body.appendChild(filterWrap);

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const headers = [
    "選択",
    "日付",
    "時刻",
    "顧客ID",
    "案件名",
    "金額",
    "丁数",
    "仕様",
  ];
  // biome-ignore lint/complexity/noForEach: <explanation>
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    Object.assign(th.style, {
      borderBottom: "1px solid #ddd",
      padding: "4px",
      background: "#fafafa",
      position: "sticky",
      top: "0",
      zIndex: "1",
      textAlign: "left",
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  const rows = [];

  data.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #eee";

    if (item.isCreated) {
      tr.style.background = "#f0f0f0";
      tr.style.color = "#aaa";
    }

    const selectTd = document.createElement("td");
    selectTd.style.textAlign = "center";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.index = String(index);
    selectTd.appendChild(checkbox);

    const fields = [
      item.today ?? "",
      item.time ?? "",
      item.cusId ?? "",
      item.caseName ?? "",
      item.price ?? "",
      item.cav ?? "",
      item.specs ?? "",
    ];

    tr.appendChild(selectTd);
    // biome-ignore lint/complexity/noForEach: <explanation>
    fields.forEach((val) => {
      const td = document.createElement("td");
      td.style.textAlign = "left";
      td.textContent = String(val ?? "");
      td.style.padding = "4px";
      tr.appendChild(td);
    });

    tr.style.cursor = "pointer";
    tr.addEventListener("click", (e) => {
      if (e.target === checkbox) return;
      checkbox.checked = !checkbox.checked;
    });

    tbody.appendChild(tr);
    rows.push({ tr, cusId: String(item.cusId ?? "") });
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  body.appendChild(table);

  // ─── 警告メッセージ ───
  const warningMsg = document.createElement("div");
  Object.assign(warningMsg.style, {
    display: "none",
    marginTop: "8px",
    padding: "6px 10px",
    background: "#fff3cd",
    border: "1px solid #ffc107",
    borderRadius: "3px",
    color: "#856404",
    fontSize: "12px",
  });
  body.appendChild(warningMsg);

  // ─── フィルター処理 ───
  function applyFilter(keyword) {
    const kw = String(keyword ?? "")
      .trim()
      .toLowerCase();
    // biome-ignore lint/complexity/noForEach: <explanation>
    rows.forEach(({ tr, cusId }) => {
      tr.style.display =
        kw === "" || cusId.toLowerCase().includes(kw) ? "" : "none";
    });
  }

  filterInput.addEventListener("input", (e) => applyFilter(e.target.value));
  clearBtn.addEventListener("click", () => {
    filterInput.value = "";
    applyFilter("");
  });

  // ─── applyボタンの処理 ───
  overlay.applyBtn.onclick = async () => {
    const checked = Array.from(
      body.querySelectorAll("input[type=checkbox]:checked"),
    );

    if (!checked.length) {
      alert("項目が選択されていません。");
      return;
    }

    const selectedItems = checked.map((cb) => data[Number(cb.dataset.index)]);

    const cusIds = new Set(
      selectedItems.map((item) => String(item.cusId ?? "")),
    );
    if (cusIds.size > 1) {
      warningMsg.textContent =
        "⚠️ 複数の顧客IDの案件が選択されています。同一顧客IDのみ選択してください。";
      warningMsg.style.display = "block";
      return;
    }
    warningMsg.style.display = "none";

    applySelectionToFlam(selectedItems);

    const selectedIndices = new Set(
      checked.map((cb) => Number(cb.dataset.index)),
    );
    const updatedData = data.map((item, i) =>
      selectedIndices.has(i) ? { ...item, isCreated: true } : item,
    );
    await chrome.storage.local.set({
      wb_quote_log_cache: JSON.stringify(updatedData),
    });

    renderPreviewTable(updatedData, overlay);
  };
}

function clickIt(el) {
  if (!el) return false;
  try {
    el.focus();
  } catch (e) {}
  try {
    el.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
    el.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
    el.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
  } catch (e) {
    console.warn("click イベントの dispatch に失敗:", e);
  }
  return true;
}

function setSelectValue(selectEl, value) {
  if (!selectEl) return false;
  try {
    selectEl.focus();
  } catch {}

  const valueStr = String(value);
  const hasOption = Array.from(selectEl.options || []).some(
    (o) => o.value === valueStr,
  );
  if (!hasOption) return false;

  selectEl.value = valueStr;
  try {
    selectEl.dispatchEvent(new Event("input", { bubbles: true }));
  } catch {}
  try {
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  } catch {}
  return true;
}

function keyEnter(el) {
  const init = {
    bubbles: true,
    cancelable: true,
    key: "Enter",
    code: "Enter",
    keyCode: 13,
  };
  el.dispatchEvent(new KeyboardEvent("keydown", init));
  el.dispatchEvent(new KeyboardEvent("keypress", init));
  el.dispatchEvent(new KeyboardEvent("keyup", init));
}

function normalizeDigits(text, length = 6) {
  // 1. 文字列化、トリム、全角→半角変換
  const normalized = String(text || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));

  // 2. 数字以外の文字が含まれる場合の考慮（必要に応じて）
  // 3. 指定の桁数まで「0」で埋める
  return normalized.padStart(length, "0");
}

// ---------- FLAM 画面への転記（ここを環境に合わせて調整） ----------
function applySelectionToFlam(items) {
  if (!items.length) {
    alert("項目が選択されていません。");
    return;
  }

  const first = items[0];

  try {
    // ===== 得意先コード入力 =====
    const customerCaption = Array.from(
      document.querySelectorAll("div[data-type='caption'].css-13ipad5"),
    ).find((el) => el.textContent.trim().startsWith("得意先"));

    if (customerCaption) {
      const group = customerCaption.parentElement;
      const codeInput = group.querySelector(
        "div.css-10tssb0 input.css-1on0wba",
      );
      if (codeInput && first.cusId) {
        codeInput.value = normalizeDigits(first.cusId);
        keyEnter(codeInput);
      }
    }

    // ===== 件名 =====
    const subjectCaption = Array.from(
      document.querySelectorAll("div[data-type='caption'].css-13ipad5"),
    ).find((el) => el.textContent.trim() === "件名");

    if (subjectCaption) {
      const group = subjectCaption.parentElement;
      const subjectInput = group.querySelector(
        "input[data-confirmable='true']",
      );
      if (subjectInput && first.caseName) {
        subjectInput.value = first.caseName;
        keyEnter(subjectInput);
        clickIt(subjectInput);
      }
    }

    // ===== 明細（グリッド） =====
    // items[0] → 明細1行目, items[1] → 明細2行目 … という形で割り当て
    let rowOffset = 0; // 列2が空の場合のオフセット
    for (let i = 1; i <= 10; i++) {
      const codeEl = document.querySelector(
        `.css-1bqu24e[data-row="${i}"][data-column="2"][data-inner-row-index="1"] input[data-confirmable="true"]`,
      );
      if (codeEl && codeEl.value.length > 0) {
        rowOffset += 1;
      }
    }
    items.forEach((item, i) => {
      const rowIndex = i + 1 + rowOffset; // data-row は 1 始まり

      // 商品名（列3, 1段目）
      const codeEl = document.querySelector(
        `.css-1bqu24e[data-row="${rowIndex}"][data-column="2"][data-inner-row-index="1"] input[data-confirmable="true"]`,
      );
      if (codeEl && item.caseName) {
        codeEl.value = "0";
        codeEl.dispatchEvent(new Event("input", { bubbles: true }));
      }

      const nameCell = document.querySelector(
        `.css-1bqu24e[data-row="${rowIndex}"][data-column="3"][data-inner-row-index="1"] input[data-confirmable="true"]`,
      );
      if (nameCell && item.caseName) {
        nameCell.value = item.caseName;
        keyEnter(nameCell);
      }
      const specsCell = document.querySelector(
        `.css-1bqu24e[data-row="${rowIndex}"][data-column="3"][data-inner-row-index="2"] input[data-confirmable="true"]`,
      );
      if (specsCell && item.specs) {
        specsCell.value = item.specs;
        keyEnter(specsCell);
      }

      // 数量（列8, 2段目）
      const quantityCell = document.querySelector(
        `.css-1bqu24e[data-row="${rowIndex}"][data-column="5"][data-inner-row-index="2"] input[data-confirmable="true"]`,
      );
      if (quantityCell && item.caseName) {
        quantityCell.value = 1;
        quantityCell.dispatchEvent(new Event("input", { bubbles: true }));
        keyEnter(quantityCell);
      }

      const dieLabelCell = document.querySelector(
        `.css-1bqu24e[data-row="${rowIndex}"][data-column="6"][data-inner-row-index="2"] input[data-confirmable="true"]`,
      );
      if (dieLabelCell && item.caseName) {
        dieLabelCell.value = "型";
        keyEnter(dieLabelCell);
      }

      // 金額（列8, 2段目）
      const amountCell = document.querySelector(
        `.css-1bqu24e[data-row="${rowIndex}"][data-column="7"][data-inner-row-index="2"] input[data-confirmable="true"]`,
      );
      if (amountCell && item.price != null) {
        amountCell.value = Number(item.price);
        amountCell.dispatchEvent(new Event("input", { bubbles: true }));
        keyEnter(amountCell);
      }

      // 外税
      const taxCell = document.querySelector(
        `.css-1bqu24e[data-row="${rowIndex}"][data-column="10"][data-inner-row-index="1"] select`,
      );
      if (taxCell) {
        setSelectValue(taxCell, "0");
      }

      // 外税
      const taxValCell = document.querySelector(
        `.css-1bqu24e[data-row="${rowIndex}"][data-column="10"][data-inner-row-index="2"] select`,
      );
      if (taxValCell) {
        setSelectValue(taxValCell, "4");
      }

      const cavCell = document.querySelector(
        `.css-1bqu24e[data-row="${rowIndex}"][data-column="11"][data-inner-row-index="1"] input[data-confirmable="true"]`,
      );
      if (cavCell) {
        cavCell.value = item.cav || "";
        keyEnter(cavCell);
      }
    });
  } catch (e) {
    alert("転記中にエラーが発生しました。コンソールを確認してください。");
  }
}

// ---------- FLAM 画面のクリア ----------
function clearFlamFields() {
  try {
    // ===== 件名 =====
    const subjectCaption = Array.from(
      document.querySelectorAll("div[data-type='caption'].css-13ipad5"),
    ).find((el) => el.textContent.trim() === "件名");

    if (subjectCaption) {
      const group = subjectCaption.parentElement;
      const subjectInput = group.querySelector(
        "input[data-confirmable='true']",
      );
      if (subjectInput ) {
        subjectInput.value = "";
        keyEnter(subjectInput);
      }
    }
    // ===== 明細（グリッド）=====
    for (let rowIndex = 1; rowIndex <= 6; rowIndex++) {
      const columns = [
        { col: 2, inner: 1 }, // 商品コード
        { col: 3, inner: 1 }, // 商品名1段目
        { col: 3, inner: 2 }, // 商品名2段目（仕様）
        { col: 5, inner: 2 }, // 数量
        { col: 6, inner: 2 }, // 単位
        { col: 7, inner: 2 }, // 金額
        { col: 11, inner: 1 }, // cav
      ];

      for (const { col, inner } of columns) {
        const el = document.querySelector(
          `.css-1bqu24e[data-row="${rowIndex}"][data-column="${col}"][data-inner-row-index="${inner}"] input[data-confirmable="true"]`,
        );
        if (el) {
          el.value = "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
          keyEnter(el);
        }
      }

      // select系（外税）
      const selectCols = [
        { col: 10, inner: 1 },
        { col: 10, inner: 2 },
      ];
      for (const { col, inner } of selectCols) {
        const sel = document.querySelector(
          `.css-1bqu24e[data-row="${rowIndex}"][data-column="${col}"][data-inner-row-index="${inner}"] select`,
        );
        if (sel) {
          sel.value = "";
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }

    console.log("[flam-ext] FLAM フィールドをクリアしました");
  } catch (e) {
    console.error("クリア中にエラー:", e);
    alert("クリア中にエラーが発生しました。コンソールを確認してください。");
  }
}
// ---------- メッセージ受信 ----------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "__PING__") {
    sendResponse({ ok: true });
    return;
  }
  if (message?.type === "CACHE_WB_QUOTE_LOG") {
    (async () => {
      try {
        const raw = window.localStorage.getItem("wb_quote_log");
        if (!raw) {
          sendResponse({ ok: true, found: false, count: 0 });
          return;
        }
        let count = 0;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) count = parsed.length;
        } catch {
          // JSON でない場合も raw のまま保存する
        }
        await chrome.storage.local.set({ wb_quote_log_cache: raw });
        sendResponse({ ok: true, found: true, count });
      } catch (e) {
        console.error("[flam-ext] CACHE_WB_QUOTE_LOG failed:", e);
        sendResponse({ ok: false, found: false, count: 0 });
      }
    })();
    return true;
  }
  if (message?.type === "OPEN_WB_QUOTE_PREVIEW") {
    if (location.origin.includes("googleusercontent.com")) {
      sendResponse({ ok: false });
      return;
    }

    (async () => {
      const data = await parseWbQuoteLog();
      const overlay = ensureModalContainer();
      renderPreviewTable(data, overlay);
      sendResponse({ ok: true });
    })();
    // 非同期で sendResponse するので true を返してメッセージチャネルを維持
    return true;
  }
});
