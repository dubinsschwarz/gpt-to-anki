const ANKI_URL = 'http://127.0.0.1:8765';

async function invokeAnki(action, params = {}) {
  const response = await fetch(ANKI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'ADD_ANKI_NOTE') return false;

  (async () => {
    const note = message.note;

    // Validate with Anki before adding. This catches invalid model/deck/fields and many duplicate cases.
    const canAdd = await invokeAnki('canAddNotes', { notes: [note] });
    if (!canAdd?.[0]) {
      sendResponse({ ok: false, error: 'Anki refused this note. It may be a duplicate or the deck/model/fields may be invalid.' });
      return;
    }

    const noteId = await invokeAnki('addNote', { note });
    sendResponse({ ok: true, noteId });
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || String(error) });
  });

  return true;
});


chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-save-dialog') return;

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs?.[0]?.id;
  if (!tabId) return;

  chrome.tabs.sendMessage(tabId, { type: 'OPEN_ANKI_SAVE_DIALOG' }, () => {
    // Ignore errors when the active tab is not a ChatGPT page or the content script is unavailable.
    void chrome.runtime.lastError;
  });
});
