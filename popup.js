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
    await sendMessage(tabId, { type: "__PING__" });
    return;
  } catch {
    // いないなら allFrames で注入
  }

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["content.js"],
  });

  // 注入後に少し待つ
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const btn = document.getElementById("openPreview");
const status = document.getElementById("status");

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  const url = tab?.url || "";
  const isGoogleusercontent = url.includes("script.google.com");

  if (isGoogleusercontent) {
    btn.textContent = "データ更新";
    btn.addEventListener("click", async () => {
      status.textContent = "更新中...";
      try {
        await ensureContentScript(tab.id);
        const res = await sendMessage(tab.id, { type: "CACHE_WB_QUOTE_LOG" });
        if (res?.ok) {
          status.textContent = `✅ 更新しました（${res.count}件）`;
        } else {
          status.textContent = "❌ データが見つかりません";
        }
      } catch (e) {
        status.textContent = `❌ 更新失敗: ${e.message}`;
      }
    });
  } else {
    btn.textContent = "見積計算履歴を表示";
    btn.addEventListener("click", async () => {
      status.textContent = "表示中...";
      try {
        await ensureContentScript(tab.id);
        const res = await sendMessage(tab.id, {
          type: "OPEN_WB_QUOTE_PREVIEW",
        });
        if (res?.ok) {
          status.textContent = "";
          window.close();
        } else {
          status.textContent = "❌ 表示失敗";
        }
      } catch (e) {
        status.textContent = `❌ 失敗: ${e.message}`;
      }
    });
  }
});
