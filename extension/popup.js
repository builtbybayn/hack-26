document.getElementById("open").addEventListener("click", () => {
  chrome.tabs.create({ url: "http://localhost:3000" });
});
