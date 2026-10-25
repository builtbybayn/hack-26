// Bridge between Chrome and the Fluid Research panel page (the app's /panel in an iframe).
// The panel page owns all UI. This script only does what needs extension APIs: report the
// active tab, read the selection on it, and fetch the paper it shows.
//
// Protocol (every message has a `type`):
//   panel -> bridge: kb:ready, kb:get-selection, kb:get-paper, kb:open-app { path? }
//   bridge -> panel: kb:tab { tab }, kb:selection { text, title, url },
//                    kb:paper { kind: "pdf", bytes } | { kind: "text", text, title }  (+ fileName, url),
//                    kb:error { request, message }
// The panel side lives in src/features/extension-panel/bridge.ts; keep both in step.

const APP_ORIGIN = "http://localhost:3000";
const frame = document.getElementById("app");
let targetTab = null;

function send(message, transfer = []) {
  frame.contentWindow?.postMessage(message, APP_ORIGIN, transfer);
}

function describe(tab) {
  if (!tab?.url || !/^https?:/.test(tab.url)) {
    return { title: tab?.title ?? "", url: tab?.url ?? "", kind: "unsupported" };
  }
  const { pathname } = new URL(tab.url);
  const isPdf = /\.pdf$/i.test(pathname) || /\/pdf\//i.test(pathname);
  return { title: tab.title || tab.url, url: tab.url, kind: isPdf ? "pdf" : "page" };
}

async function refreshTargetTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && !tab.url?.startsWith(location.origin)) {
    targetTab = tab;
  } else if (targetTab) {
    // An extension page is active: keep the last real tab, but with its current URL and title.
    targetTab = await chrome.tabs.get(targetTab.id).catch(() => null);
  }
  send({ type: "kb:tab", tab: describe(targetTab) });
}

chrome.tabs.onActivated.addListener(refreshTargetTab);
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (tabId !== targetTab?.id) return;
  if (change.url || change.title || change.status === "complete") {
    targetTab = tab;
    send({ type: "kb:tab", tab: describe(targetTab) });
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId !== targetTab?.id) return;
  targetTab = null;
  void refreshTargetTab();
});

async function runInTab(tabId, func) {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func });
  return result?.result;
}

function fileNameFor(tab, extension) {
  const base = (tab.title || "paper")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .trim()
    .slice(0, 80);
  return base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`;
}

function looksLikePdf(bytes) {
  const head = new TextDecoder("latin1").decode(new Uint8Array(bytes.slice(0, 1024)));
  return head.includes("%PDF-");
}

async function fetchPdf(tab) {
  const response = await fetch(tab.url);
  if (!response.ok) throw new Error(`the download failed (HTTP ${response.status})`);
  const bytes = await response.arrayBuffer();
  return looksLikePdf(bytes) ? bytes : null;
}

async function handle(type, fail) {
  const tab = targetTab;
  const info = describe(tab);
  if (!tab || info.kind === "unsupported") {
    fail("Open a paper or article in a normal web page first.");
    return;
  }

  // Request access before any other await so the click's user gesture still applies.
  // Already-granted sites resolve immediately without a prompt.
  const granted = await chrome.permissions.request({ origins: [`${new URL(tab.url).origin}/*`] });
  if (!granted) {
    fail("Access to this site was declined.");
    return;
  }

  if (type === "kb:get-selection") {
    let text = "";
    try {
      text = ((await runInTab(tab.id, () => window.getSelection()?.toString() ?? "")) ?? "").trim();
    } catch {
      // Chrome's PDF viewer and some pages can't be scripted; handled below.
    }
    if (!text) {
      fail(
        info.kind === "pdf"
          ? "Chrome's PDF viewer doesn't share selections. Use the paper's text in the panel instead."
          : "Select some text on the page first.",
      );
      return;
    }
    send({ type: "kb:selection", text: text.slice(0, 20000), title: tab.title, url: tab.url });
    return;
  }

  // kb:get-paper: a PDF is downloaded as-is; any other page is sent as its readable text.
  if (info.kind === "pdf") {
    const bytes = await fetchPdf(tab);
    if (!bytes) {
      fail("This tab doesn't contain a PDF that can be downloaded.");
      return;
    }
    send(
      { type: "kb:paper", kind: "pdf", bytes, fileName: fileNameFor(tab, ".pdf"), url: tab.url },
      [bytes],
    );
    return;
  }
  let text = "";
  try {
    text = await runInTab(tab.id, () => {
      const root = document.querySelector("article, main, [role=main]") ?? document.body;
      return root.innerText;
    });
  } catch {
    // Pages that can't be scripted may still be PDFs served without a .pdf URL.
    const bytes = await fetchPdf(tab).catch(() => null);
    if (bytes) {
      send(
        { type: "kb:paper", kind: "pdf", bytes, fileName: fileNameFor(tab, ".pdf"), url: tab.url },
        [bytes],
      );
      return;
    }
  }
  if (!text?.trim()) {
    fail("No readable text was found in this tab.");
    return;
  }
  send({
    type: "kb:paper",
    kind: "text",
    text,
    title: tab.title,
    fileName: fileNameFor(tab, ".md"),
    url: tab.url,
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== frame.contentWindow || event.origin !== APP_ORIGIN) return;
  const type = event.data?.type;
  if (type === "kb:ready") void refreshTargetTab();
  else if (type === "kb:open-app") void openVault(event.data.path);
  else if (type === "kb:get-selection" || type === "kb:get-paper") {
    const fail = (message) => send({ type: "kb:error", request: type, message });
    handle(type, fail).catch((error) => fail(`Couldn't read this tab: ${error.message}`));
  }
});

/** Shows the vault, reusing an open vault tab. Only the vault's own paper links are allowed. */
async function openVault(path) {
  const safe =
    typeof path === "string" && /^\/(\?(paper=[\w-]+(&page=\d+)?|entry=[\w-]+))?$/.test(path)
      ? path
      : "/";
  const url = `${APP_ORIGIN}${safe}`;
  const tabs = await chrome.tabs.query({ url: `${APP_ORIGIN}/*` });
  const vaultTab = tabs.find((candidate) => new URL(candidate.url).pathname === "/");
  if (!vaultTab) {
    await chrome.tabs.create({ url });
    return;
  }
  await chrome.tabs.update(vaultTab.id, { url, active: true });
  await chrome.windows.update(vaultTab.windowId, { focused: true });
}

// Iframes don't report failed loads, so check the app directly.
fetch(`${APP_ORIGIN}/api/health`).catch(() => {
  document.getElementById("offline").hidden = false;
  frame.hidden = true;
});

document.getElementById("retry").addEventListener("click", () => location.reload());
