const START_MARKER = 'ANKI_NOTE_JSON_START';
const END_MARKER = 'ANKI_NOTE_JSON_END';
const EXT_VERSION = '0.1.10';
const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';
const DEFAULT_SETTINGS = { diagnosticsEnabled: false, feedbackDefaultEnabled: false };

let c2aButtonObserver = null;
let c2aButtonWatchdog = null;
let c2aLastUrl = location.href;

function normaliseNote(candidate) {
  if (candidate.deckName && candidate.modelName && candidate.fields) return candidate;
  if (candidate.front && candidate.back) {
    return {
      deckName: candidate.deckName || candidate.deck || 'ChatGPT Flashcards',
      modelName: candidate.modelName || 'Basic',
      fields: { Front: candidate.front, Back: candidate.back },
      tags: candidate.tags || ['chatgpt']
    };
  }
  throw new Error('JSON must contain Anki fields or friendly fields {front, back}.');
}

function parseJsonBlock(text, fromLast = false) {
  const source = String(text || '').replace(/\u00a0/g, ' ');
  const start = fromLast ? source.lastIndexOf(START_MARKER) : source.indexOf(START_MARKER);
  if (start === -1) return null;
  const end = source.indexOf(END_MARKER, start + START_MARKER.length);
  if (end === -1 || end <= start) return null;
  return normaliseNote(JSON.parse(source.slice(start + START_MARKER.length, end).trim()));
}

function parseNoteFromAnyText(text) {
  const source = String(text || '').trim();
  if (!source) throw new Error('No JSON was provided.');
  return parseJsonBlock(source, true) || normaliseNote(JSON.parse(source));
}

function findLatestNote() {
  const messages = Array.from(document.querySelectorAll('[data-message-author-role="assistant"], article, [data-testid^="conversation-turn-"]')).reverse();
  for (const message of messages) {
    try {
      const note = parseJsonBlock(message.innerText || '');
      if (note) return { note, source: 'message' };
    } catch (_) {}
  }
  try {
    const note = parseJsonBlock(document.body?.innerText || '', true);
    if (note) return { note, source: 'page' };
  } catch (error) {
    return { note: null, source: 'parse-error', error };
  }
  return { note: null, source: 'none' };
}

function getNotePreview(note) {
  const fields = note.fields || {};
  return {
    deckName: note.deckName || 'ChatGPT Flashcards',
    modelName: note.modelName || 'Basic',
    tags: Array.isArray(note.tags) ? note.tags.join(' ') : (note.tags || ''),
    front: fields.Front || fields.front || '',
    back: fields.Back || fields.back || ''
  };
}

function tagsFromInput(value) {
  return String(value || '').split(/[\s,]+/).map((tag) => tag.trim()).filter(Boolean);
}

function buildEditedNote(originalNote, values) {
  const note = structuredClone(originalNote);
  note.deckName = values.deckName.trim() || 'ChatGPT Flashcards';
  note.modelName = values.modelName.trim() || 'Basic';
  note.tags = tagsFromInput(values.tags);
  note.fields = { ...(note.fields || {}), Front: values.front.trim(), Back: values.back.trim() };
  return note;
}

function comparable(note) {
  const preview = getNotePreview(note);
  return {
    Deck: preview.deckName.trim(),
    Model: preview.modelName.trim(),
    Tags: tagsFromInput(preview.tags),
    Front: preview.front.trim(),
    Back: preview.back.trim()
  };
}

function sameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
  }
  return a === b;
}

function buildEditFeedback(originalNote, editedNote) {
  const before = comparable(originalNote);
  const after = comparable(editedNote);
  const changedKeys = Object.keys(before).filter((key) => !sameValue(before[key], after[key]));
  if (!changedKeys.length) return null;
  return [
    'Flashcard edit feedback for this chat:',
    ...changedKeys.map((key) => `- ${key} changed from ${JSON.stringify(before[key])} to ${JSON.stringify(after[key])}.`),
    'Please use these edits as guidance for future Anki flashcards in this chat.'
  ].join('\n');
}

function getSettings() {
  return new Promise((resolve) => {
    try { chrome.storage.sync.get(DEFAULT_SETTINGS, resolve); }
    catch (_) { resolve(DEFAULT_SETTINGS); }
  });
}

async function showDiagnostic(text) {
  const settings = await getSettings();
  if (settings.diagnosticsEnabled) showToast(`Diagnostic: ${text}`, false, 7000);
}

async function showError(text, details = '') {
  const settings = await getSettings();
  const message = settings.diagnosticsEnabled && details ? `${text}\n\n${details}` : text;
  showToast(message, true, settings.diagnosticsEnabled ? 12000 : 7000);
}

function getRuntime() {
  const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime;
  return runtime && typeof runtime.sendMessage === 'function' ? runtime : null;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    const runtime = getRuntime();
    if (!runtime) return resolve({ ok: false, error: 'Extension runtime unavailable.' });
    try {
      runtime.sendMessage(message, (response) => {
        const lastError = globalThis.chrome?.runtime?.lastError || globalThis.browser?.runtime?.lastError;
        resolve(lastError ? { ok: false, error: lastError.message || String(lastError) } : (response || { ok: false, error: 'No background response.' }));
      });
    } catch (error) {
      resolve({ ok: false, error: error.message || String(error) });
    }
  });
}

async function invokeAnkiDirect(action, params = {}) {
  const response = await fetch(ANKI_CONNECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function addNoteViaDirectAnki(note) {
  const canAdd = await invokeAnkiDirect('canAddNotes', { notes: [note] });
  if (!canAdd?.[0]) return { ok: false, error: 'Anki refused this note. It may be a duplicate or invalid.' };
  const noteId = await invokeAnkiDirect('addNote', { note });
  return { ok: true, noteId, route: 'direct' };
}

async function addNoteToAnki(note) {
  const runtimeResult = await sendRuntimeMessage({ type: 'ADD_ANKI_NOTE', note });
  if (runtimeResult?.ok) return { ...runtimeResult, route: 'runtime' };
  await showDiagnostic(`Runtime save failed: ${runtimeResult?.error || 'unknown'}. Trying direct save.`);
  try { return await addNoteViaDirectAnki(note); }
  catch (error) { return { ok: false, error: `Runtime error: ${runtimeResult?.error || 'unknown'}\nDirect error: ${error.message || String(error)}\nKeep Anki open with AnkiConnect installed.` }; }
}

function showToast(text, isError = false, timeoutMs = 5000) {
  const toast = document.createElement('div');
  toast.className = `c2a-toast ${isError ? 'c2a-error' : 'c2a-success'}`;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), timeoutMs);
}

function closeModal() { document.getElementById('c2a-modal-root')?.remove(); }

function makeButton(text, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  return button;
}

function buildTextInput(label, value, compact = false) {
  const wrapper = document.createElement('label');
  wrapper.className = compact ? 'c2a-field c2a-field-compact' : 'c2a-field';
  const heading = document.createElement('span');
  heading.className = 'c2a-field-label';
  heading.textContent = label;
  const input = document.createElement('input');
  input.className = 'c2a-input';
  input.type = 'text';
  input.value = String(value || '');
  input.autocomplete = 'off';
  input.spellcheck = false;
  wrapper.append(heading, input);
  return { wrapper, input };
}

function buildTextarea(label, value, options = {}) {
  const wrapper = document.createElement('label');
  wrapper.className = 'c2a-field';
  const heading = document.createElement('span');
  heading.className = 'c2a-field-label';
  heading.textContent = label;
  const textarea = document.createElement('textarea');
  textarea.className = 'c2a-textarea';
  textarea.value = String(value || '');
  textarea.rows = options.rows || 5;
  textarea.spellcheck = options.spellcheck ?? true;
  if (options.placeholder) textarea.placeholder = options.placeholder;
  wrapper.append(heading, textarea);
  return { wrapper, textarea };
}

function buildCheckbox(label, checked, helpText = '') {
  const wrapper = document.createElement('label');
  wrapper.className = 'c2a-checkbox-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(checked);
  const text = document.createElement('span');
  const main = document.createElement('span');
  main.className = 'c2a-checkbox-main';
  main.textContent = label;
  text.append(main);
  if (helpText) {
    const help = document.createElement('span');
    help.className = 'c2a-checkbox-help';
    help.textContent = helpText;
    text.append(help);
  }
  wrapper.append(input, text);
  return { wrapper, input };
}

function makeModalShell(titleText, subtitleText) {
  closeModal();
  const root = document.createElement('div');
  root.id = 'c2a-modal-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'c2a-modal-title');
  const backdrop = document.createElement('div');
  backdrop.className = 'c2a-modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'c2a-modal';
  const header = document.createElement('div');
  header.className = 'c2a-modal-header';
  const titleBlock = document.createElement('div');
  const title = document.createElement('h2');
  title.id = 'c2a-modal-title';
  title.textContent = titleText;
  const subtitle = document.createElement('p');
  subtitle.textContent = subtitleText;
  titleBlock.append(title, subtitle);
  const closeButton = makeButton('×', 'c2a-icon-button');
  closeButton.setAttribute('aria-label', 'Close');
  header.append(titleBlock, closeButton);
  const content = document.createElement('div');
  content.className = 'c2a-modal-content';
  const footer = document.createElement('div');
  footer.className = 'c2a-modal-footer';
  modal.append(header, content, footer);
  root.append(backdrop, modal);
  document.body.appendChild(root);
  return { backdrop, closeButton, content, footer };
}

function promptForManualJson() {
  return new Promise((resolve) => {
    const shell = makeModalShell('Paste Anki JSON', 'No marked card was found. Paste a marked block or raw Anki note JSON here.');
    const jsonField = buildTextarea('Anki JSON', '', { rows: 14, spellcheck: false, placeholder: `${START_MARKER}\n{\n  "deckName": "ChatGPT Flashcards",\n  "modelName": "Basic",\n  "fields": {\n    "Front": "...",\n    "Back": "..."\n  },\n  "tags": ["..."]\n}\n${END_MARKER}` });
    const hint = document.createElement('p');
    hint.className = 'c2a-edit-hint';
    hint.textContent = 'Shortcut: Ctrl/⌘ + Enter parses this JSON. Escape cancels.';
    shell.content.append(jsonField.wrapper, hint);
    const cancelButton = makeButton('Cancel', 'c2a-secondary-button');
    const parseButton = makeButton('Preview this card', 'c2a-primary-button');
    shell.footer.append(cancelButton, parseButton);
    const finish = (note) => { closeModal(); document.removeEventListener('keydown', onKeyDown, true); resolve(note); };
    const tryParse = () => { try { finish(parseNoteFromAnyText(jsonField.textarea.value)); } catch (error) { showError('Could not parse that Anki JSON.', error.message || String(error)); } };
    function onKeyDown(event) { if (event.key === 'Escape') finish(null); if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') tryParse(); }
    shell.backdrop.addEventListener('click', () => finish(null));
    shell.closeButton.addEventListener('click', () => finish(null));
    cancelButton.addEventListener('click', () => finish(null));
    parseButton.addEventListener('click', tryParse);
    document.addEventListener('keydown', onKeyDown, true);
    jsonField.textarea.focus();
  });
}

async function confirmNoteWithModal(note) {
  const settings = await getSettings();
  return new Promise((resolve) => {
    const preview = getNotePreview(note);
    const shell = makeModalShell('Edit and save flashcard to Anki', 'Make any changes you want. These edited values are what will be saved.');
    const deckField = buildTextInput('Deck', preview.deckName, true);
    const modelField = buildTextInput('Model', preview.modelName, true);
    const tagsField = buildTextInput('Tags', preview.tags, true);
    const meta = document.createElement('div');
    meta.className = 'c2a-edit-grid';
    meta.append(deckField.wrapper, modelField.wrapper, tagsField.wrapper);
    const frontField = buildTextarea('Front', preview.front, { rows: 4 });
    const backField = buildTextarea('Back', preview.back, { rows: 7 });
    const feedbackCheckbox = buildCheckbox('Show edit feedback after saving', settings.feedbackDefaultEnabled, 'Only appears if you changed the card.');
    const hint = document.createElement('p');
    hint.className = 'c2a-edit-hint';
    hint.textContent = 'Shortcut: Ctrl/⌘ + Enter saves. Escape cancels.';
    shell.content.append(meta, frontField.wrapper, backField.wrapper, feedbackCheckbox.wrapper, hint);
    const cancelButton = makeButton('Cancel', 'c2a-secondary-button');
    const saveButton = makeButton('Save edited card to Anki', 'c2a-primary-button');
    shell.footer.append(cancelButton, saveButton);
    const finish = (result) => { closeModal(); document.removeEventListener('keydown', onKeyDown, true); resolve(result); };
    const trySave = () => {
      const values = { deckName: deckField.input.value, modelName: modelField.input.value, tags: tagsField.input.value, front: frontField.textarea.value, back: backField.textarea.value };
      if (!values.front.trim() || !values.back.trim()) return showToast('Front and Back cannot be empty.', true);
      finish({ editedNote: buildEditedNote(note, values), showFeedback: feedbackCheckbox.input.checked });
    };
    function onKeyDown(event) { if (event.key === 'Escape') finish(null); if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') trySave(); }
    shell.backdrop.addEventListener('click', () => finish(null));
    shell.closeButton.addEventListener('click', () => finish(null));
    cancelButton.addEventListener('click', () => finish(null));
    saveButton.addEventListener('click', trySave);
    document.addEventListener('keydown', onKeyDown, true);
    frontField.textarea.focus();
    frontField.textarea.select();
  });
}

async function copyTextToClipboard(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw error;
  }
}

function showPostSaveModal(feedbackText, noteId) {
  const shell = makeModalShell('Saved to Anki', `Note ID: ${noteId}. Copy this edit summary if you want to use it in the chat.`);
  const feedbackField = buildTextarea('Edit feedback for ChatGPT', feedbackText, { rows: 8, spellcheck: true });
  shell.content.append(feedbackField.wrapper);
  const closeButton = makeButton('Close', 'c2a-secondary-button');
  const copyButton = makeButton('Copy feedback for ChatGPT', 'c2a-primary-button');
  shell.footer.append(closeButton, copyButton);
  const finish = () => { closeModal(); document.removeEventListener('keydown', onKeyDown, true); };
  const copyFeedback = async () => { try { await copyTextToClipboard(feedbackField.textarea.value); showToast('Copied edit feedback to clipboard.'); } catch (error) { showError('Could not copy feedback to clipboard.', error.message || String(error)); } };
  function onKeyDown(event) { if (event.key === 'Escape') finish(); if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') copyFeedback(); }
  shell.backdrop.addEventListener('click', finish);
  shell.closeButton.addEventListener('click', finish);
  closeButton.addEventListener('click', finish);
  copyButton.addEventListener('click', copyFeedback);
  document.addEventListener('keydown', onKeyDown, true);
  feedbackField.textarea.focus();
  feedbackField.textarea.select();
}

async function saveLatestCard() {
  await showDiagnostic('Save command received. Searching for latest Anki JSON block.');
  const result = findLatestNote();
  let note = result.note;
  if (!note) {
    await showDiagnostic(`No card found. Source=${result.source}. Opening manual paste fallback.`);
    note = await promptForManualJson();
    if (!note) return;
  } else {
    await showDiagnostic(`Found Anki JSON block via ${result.source}.`);
  }
  const saveChoice = await confirmNoteWithModal(note);
  if (!saveChoice) return;
  const response = await addNoteToAnki(saveChoice.editedNote);
  if (!response?.ok) return showError('Failed to save to Anki.', response?.error || 'Unknown error from AnkiConnect.');
  await showDiagnostic(`Saved through ${response.route || 'unknown'} route.`);
  const feedbackText = saveChoice.showFeedback ? buildEditFeedback(note, saveChoice.editedNote) : null;
  if (feedbackText) showPostSaveModal(feedbackText, response.noteId);
  else showToast(`Saved to Anki. Note ID: ${response.noteId}`);
}

function addButton() {
  if (!document.body) return;
  let button = document.getElementById('c2a-save-button');
  if (button?.dataset?.c2aVersion === EXT_VERSION) return;
  if (button) button.remove();
  button = document.createElement('button');
  button.id = 'c2a-save-button';
  button.dataset.c2aVersion = EXT_VERSION;
  button.type = 'button';
  button.textContent = 'Save latest Anki card';
  button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); saveLatestCard(); });
  document.body.appendChild(button);
}

function startSelfHealingButton() {
  addButton();
  if (!c2aButtonObserver) {
    let queued = false;
    c2aButtonObserver = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; addButton(); });
    });
    c2aButtonObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  if (!c2aButtonWatchdog) c2aButtonWatchdog = setInterval(() => { if (location.href !== c2aLastUrl) c2aLastUrl = location.href; addButton(); }, 1500);
}

getRuntime()?.onMessage?.addListener?.((message, sender, sendResponse) => {
  if (message?.type !== 'OPEN_ANKI_SAVE_DIALOG') return false;
  saveLatestCard();
  sendResponse({ ok: true });
  return false;
});

startSelfHealingButton();
