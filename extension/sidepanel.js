// TEMPORARY development panel script. See the comment in sidepanel.html.
const APP_ORIGIN = "http://localhost:3000";
const frame = document.getElementById("app");
const status = document.getElementById("status");

function showStatus(message, isError = false) {
  status.hidden = !message;
  status.textContent = message;
  status.className = isError ? "error" : "";
}

document.getElementById("open-app").addEventListener("click", () => {
  chrome.tabs.create({ url: APP_ORIGIN });
});

document.getElementById("selection").addEventListener("click", async () => {
  showStatus("");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    showStatus("Select text on a normal web page first.", true);
    return;
  }
  if (tab.url.startsWith(APP_ORIGIN)) {
    showStatus("That's the KnowBefore app itself; use its own controls.", true);
    return;
  }

  // Ask for access to this site only, and only when the user asks to read from it.
  const origins = [`${new URL(tab.url).origin}/*`];
  const granted =
    (await chrome.permissions.contains({ origins })) ||
    (await chrome.permissions.request({ origins }));
  if (!granted) {
    showStatus("Permission to read this page was declined.", true);
    return;
  }

  let text = "";
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? "",
    });
    text = (result?.result ?? "").trim();
  } catch (error) {
    showStatus(`Couldn't read this page: ${error.message}`, true);
    return;
  }

  if (!text) {
    showStatus(
      /\.pdf($|[?#])/i.test(tab.url)
        ? "Chrome's built-in PDF viewer doesn't share selections. Upload the PDF in the panel instead."
        : "No text is selected on this page.",
      true,
    );
    return;
  }

  // The panel page only accepts these messages from extension origins; the text is shown as data.
  frame.contentWindow.postMessage(
    { type: "knowbefore:selection", text: text.slice(0, 20000), title: tab.title, url: tab.url },
    APP_ORIGIN,
  );
  showStatus(`Sent ${text.length.toLocaleString()} characters from “${tab.title}”.`);
});

// Iframes don't report failed loads, so check the app directly.
fetch(`${APP_ORIGIN}/api/health`).catch(() =>
  showStatus(
    "Can't reach the app. Start it with `npm run dev` (port 3000), then reopen the panel.",
    true,
  ),
);
