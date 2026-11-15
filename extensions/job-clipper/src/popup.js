// Stub. Flow: explicit click -> read ONLY the active tab (activeTab grant) -> user reviews/edits -> explicit confirm -> POST.
// Never monitors tabs, never reads history, never stores a long-lived secret. The session id comes from the web app (/clips).
const API = 'https://YOUR-API/api/v1'; // set per environment; the bearer token is obtained via the secure sign-in flow (pending)
const $ = (s) => document.querySelector(s);

$('#capture').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({ title: document.title, url: location.href, text: (document.querySelector('main') || document.body).innerText.slice(0, 20000) }),
  });
  const f = $('#review'); f.hidden = false;
  f.title.value = result.title; f.description.value = result.text; f.dataset.url = result.url;
  $('#status').textContent = 'Review and correct the fields. Nothing has been sent.';
});

$('#review').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (!f.reviewed.checked) return;
  const token = await new Promise((r) => chrome.storage.session.get('token', (v) => r(v.token))); // short-lived, session storage only
  const res = await fetch(`${API}/clipped-jobs`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: f.title.value, company: f.company.value, url: f.dataset.url, description: f.description.value, source: 'EXTENSION', reviewed: true, idempotencyKey: crypto.randomUUID() }),
  });
  $('#status').textContent = res.ok ? 'Saved. Open XCron CV to analyse it.' : `Not saved (${res.status}).`;
});
