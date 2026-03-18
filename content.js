// ---------- ユーティリティ ----------
async function parseWbQuoteLog() {
  try {
    // 1. まず現在ページの localStorage を直接見る（同一オリジンならこれで取れる）
    let raw = null;
    try {
      raw = window.localStorage.getItem("wb_quote_log");
    } catch (e) {
      console.warn("localStorage への直接アクセスに失敗:", e);
    }

    // 2. 見つからなければ chrome.storage.local にキャッシュされた値を使う
    if (!raw) {
      const stored = await chrome.storage.local.get("wb_quote_log_cache");
      raw = stored.wb_quote_log_cache || null;
    }

    if (!raw) return [];

    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data;
  } catch (e) {
    console.error("wb_quote_log の取得／パースに失敗:", e);
    return [];
  }
}

(async () => {
  try {
    const raw = window.localStorage.getItem("wb_quote_log");
    await chrome.storage.local.set({ wb_quote_log_cache: raw });
  } catch (e) {
    console.warn("wb_quote_log のキャッシュ保存に失敗（無視します）:", e);
  }
})();

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
    alignItems: "center",
    justifyContent: "center",
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
  header.textContent = "wb_quote_log から選択";
  Object.assign(header.style, {
    padding: "8px 12px",
    borderBottom: "1px solid #ddd",
    background: "#f5f5f5",
    fontWeight: "bold",
  });

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

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "閉じる";
  closeBtn.type = "button";
  closeBtn.style.minWidth = "80px";

  const applyBtn = document.createElement("button");
  applyBtn.textContent = "選択を転記";
  applyBtn.type = "button";
  applyBtn.style.minWidth = "100px";
  applyBtn.style.background = "#4caf50";
  applyBtn.style.color = "#fff";
  applyBtn.style.border = "none";
  applyBtn.style.cursor = "pointer";

  footer.appendChild(closeBtn);
  footer.appendChild(applyBtn);

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
    body.textContent = "見積算出履歴 にデータがありません。";
    return;
  }

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const headers = ["選択", "日付", "時刻", "顧客ID", "案件名", "金額"];
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

  data.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #eee";

    const selectTd = document.createElement("td");
    selectTd.style.textAlign = "center";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.index = String(index);
    selectTd.appendChild(checkbox);

    const fields = [
      item.today ?? "",
      item.time ?? "",
      item.cusId ?? item.cusId ?? "",
      item.caseName ?? "",
      item.price ?? "",
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

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  body.appendChild(table);

  // apply ボタンの処理
  overlay.applyBtn.onclick = () => {
    const checked = Array.from(
      body.querySelectorAll("input[type=checkbox]:checked"),
    );
    const selectedItems = checked.map((cb) => data[Number(cb.dataset.index)]);
    applySelectionToFlam(selectedItems);
    overlay.remove();
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
// ---------- FLAM 画面への転記 ----------
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
        codeInput.dispatchEvent(new Event("input", { bubbles: true }));
        codeInput.dispatchEvent(new Event("change", { bubbles: true }));
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
        subjectInput.dispatchEvent(new Event("input", { bubbles: true }));
        subjectInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    // ===== 明細（グリッド） =====
    // items[0] → 明細1行目, items[1] → 明細2行目 … という形で割り当て
    items.forEach((item, i) => {
      const rowIndex = i + 1; // data-row は 1 始まり

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
        nameCell.value += item.caseName;
        keyEnter(nameCell);
      }

      // 数量（列8, 2段目）
      const quantityCell = document.querySelector(
        `.css-1bqu24e[data-row="${rowIndex}"][data-column="5"][data-inner-row-index="2"] input[data-confirmable="true"]`,
      );
      if (quantityCell) {
        quantityCell.value = 1;
        quantityCell.dispatchEvent(new Event("input", { bubbles: true }));
        keyEnter(quantityCell);
      }

      const dieLabelCell = document.querySelector(
        `.css-1bqu24e[data-row="${rowIndex}"][data-column="6"][data-inner-row-index="2"] input[data-confirmable="true"]`,
      );
      if (dieLabelCell) {
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
    });
  } catch (e) {
    console.error("転記中にエラー:", e);
    alert("転記中にエラーが発生しました。コンソールを確認してください。");
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
