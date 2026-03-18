async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function sendMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(res);
    });
  });
}

async function ensureContentScript(tabId) {
  try {
    // すでに受信側がいるなら何もしない
    await sendMessage(tabId, { type: "__PING__" });
    return;
  } catch {
    // いないなら allFrames で注入してから再度
  }

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["content.js"]
  });
}


document.getElementById("openPreview").addEventListener("click", async () => {
    const status = document.getElementById("status");
    try {
      const tab = await getActiveTab();
      if (!tab?.id) {
        status.textContent = "タブが取得できませんでした。";
        return;
      }
    
      await ensureContentScript(tab.id);
      const res = await sendMessage(tab.id, { type: "CACHE_WB_QUOTE_LOG" });
      if (!res?.ok) {
        status.textContent = "キャッシュに失敗しました。";
        return;
      }
    
      if (res.found) {
        status.textContent = `キャッシュしました（件数: ${res.count}）。次にFLAM見積画面で「表示」を押してください。`;
      } else {
        status.textContent = "このページの localStorage に wb_quote_log が見つかりません。";
      }
    } catch (e) {
      console.error(e);
      status.textContent = "このページでは実行できません（権限/対象URL外の可能性）。";
    }
  status.textContent = "wb_quote_log の状態を確認中…";

  try {
    // まず chrome.storage.local にキャッシュがあるか確認
    const stored = await chrome.storage.local.get("wb_quote_log_cache");
    if (stored.wb_quote_log_cache) {
      try {
        const arr = JSON.parse(stored.wb_quote_log_cache);
        status.textContent = `キャッシュ件数: ${Array.isArray(arr) ? arr.length : "不明"} 件。プレビューを表示します…`;
      } catch {
        status.textContent = "キャッシュはありますが JSON の解析に失敗しました。";
      }
    } else {
      status.textContent = "キャッシュが見つかりません。先に wb_quote_log を持つページを開いてください。";
    }

    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      status.textContent += " （タブ取得に失敗）";
      return;
    }

    // content.js にメッセージ送信して、モーダル表示を指示
    try {
      await ensureContentScript(tab.id);
      const res = await sendMessage(tab.id, { type: "OPEN_WB_QUOTE_PREVIEW" });
      status.textContent = res?.ok
        ? "プレビューを表示しました。"
        : "プレビュー表示に失敗しました。";
    } catch {
      status.textContent = "このページでは実行できません。FLAMの見積画面を開いてください。";
    }
  } catch (e) {
    console.error(e);
    status.textContent = "エラーが発生しました。コンソールを確認してください。";
  }
});
