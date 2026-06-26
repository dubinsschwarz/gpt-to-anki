const START_MARKER = 'ANKI_NOTE_JSON_START';
const END_MARKER = 'ANKI_NOTE_JSON_END';
const EXT_VERSION = '0.1.8';

let c2aButtonObserver = null;
let c2aButtonWatchdog = null;
let c2aLastUrl = location.href;

function normaliseNote(candidate) {
  // Accept either a raw AnkiConnect note or a friendlier card shape.
  if (candidate.deckName && candidate.modelName && candidate.fields) {
    return candidate;
  }

  if (candidate.front && candidate.back) {
    return {
      deckName: candidate.deckName || candidate.deck || 'ChatGPT Flashcards',
      modelName: candidate.modelName || 'Basic',
      fields: {
        Front: candidate.front,
        Back: candidate.back
      },
      tags: candidate.tags || ['chatgpt']
    };
  }

  throw new Error('JSON must contain either AnkiConnect fields {deckName, modelName, fields} or friendly fields {front, back}.');
}

function parseJsonBlock(text, fromLast = false) {
  const source = String(text || '').replace(/\u00a0/g, ' ');
  const start = fromLast ? source.lastIndexOf(START_MARKER) : source.indexOf(START_MARKER);
  if (start === -1) return null;

  const end = source.indexOf(END_MARKER, start + START_MARKER.length);
  if (end === -1 || end <= start) return null;

  const raw = source.slice(start + START_MARKER.length, end).trim();
  return normaliseNote(JSON.parse(raw));
}

function parseNoteFromAnyText(text) {
  const source = String(text || '').trim();
  if (!source) throw new Error('No JSON was provided.');

  const marked = parseJsonBlock(source, true);
  if (marked) return marked;

  return normaliseNote(JSON.parse(source));
}

function getAssistantMessages() {
  // ChatGPT DOM changes over time; this intentionally uses broad selectors and falls back to page text scanning.
  return Array.from(document.querySelectorAll('[data-message-author-role="assistant"], article, [data-testid^="conversation-turn-"]'));
}

function findLatestNote() {
  const messages = getAssistantMessages().reverse();
  for (const message of messages) {
    try {
      const note = parseJsonBlock(message.innerText || '');
      if (note) return { note, element: message, source: 'message' };
    } catch (error) {
      // Keep searching; one malformed block should not prevent finding a later valid block.
    }
  }

  // Projects and other ChatGPT surfaces sometimes use different message DOM structures.
  // Fall back to scanning the loaded page text for the latest marked block.
  try {
    const pageText = document.body?.innerText || '';
    const pageNote = parseJsonBlock(pageText, true);
    if (pageNote) return { note: pageNote, element: document.body, source: 'page' };
  } catch (error) {
    return { note: null, element: null, source: 'parse-error', error };
  }

  return { note: null, element: null, source: 'none' };
}

function getNotePreview(note) {
  const fields = note.fields || {};
  return {
    front: fields.Front || fields.front || '',
    back: fields.Back || fields.back || '',
    tags: Array.isArray(note.tags) ? note.tags.join(' ') : (note.tags || ''),
    modelName: note.modelName || 'Basic',
    deckName: note.deckName || 'ChatGPT Flashcards'
  };
}

function tagsFromInput(value) {
  return String(value || '')
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function buildEditedNote(originalNote, formValues) {
  const note = structuredClone(originalNote);
  note.deckName = formValues.deckName.trim() || 'ChatGPT Flashcards';
  note.modelName = formValues.modelName.trim() || 'Basic';
  note.tags = tagsFromInput(formValues.tags);
  note.fields = {
    ...(note.fields || {}),
    Front: formValues.front.trim(),
    Back: formValues.back.trim()
  };
  return note;
}


function normaliseForCompare(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value ?? '').trim();
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function describeValue(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(String(value ?? ''));
}

function getComparableNote(note) {
  const preview = getNotePreview(note);
  return {
    deckName: normaliseForCompare(preview.deckName),
    modelName: normaliseForCompare(preview.modelName),
    tags: tagsFromInput(preview.tags),
    front: normaliseForCompare(preview.front),
    back: normaliseForCompare(preview.back)
  };
}

function buildEditFeedback(originalNote, editedNote) {
  const original = getComparableNote(originalNote);
  const edited = getComparableNote(editedNote);
  const changes = [];

  const addChange = (label, before, after, isArray = false) => {
    const same = isArray ? arraysEqual(before, after) : before === after;
    if (!same) changes.push({ label, before, after });
  };

  addChange('Deck', original.deckName, edited.deckName);
  addChange('Model', original.modelName, edited.modelName);
  addChange('Tags', original.tags, edited.tags, true);
  addChange('Front', original.front, edited.front);
  addChange('Back', original.back, edited.back);

  if (!changes.length) {
    return 'Flashcard edit feedback for this chat:\n- No edits were made to the saved flashcard.';
  }

  const lines = [
    'Flashcard edit feedback for this chat:',
    ...changes.map((change) => `- ${change.label} changed from ${describeValue(change.before)} to ${describeValue(change.after)}.`),
    'Please use these edits as guidance for future Anki flashcards in this chat.'
  ];
  return lines.join('\n');
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } finally {
      textarea.remove();
    }
    if (!copied) throw error;
    return true;
  }
}

function showPostSaveModal(originalNote, editedNote, noteId) {
  const feedback = buildEditFeedback(originalNote, editedNote);
  const shell = makeModalShell(
    'Saved to Anki',
    `Note ID: ${noteId}. You can copy a concise edit summary back into ChatGPT if you want it to adapt in this chat.`
  );

  const feedbackField = buildTextarea('Edit feedback for ChatGPT', feedback, { rows: 8, spellcheck: true });
  feedbackField.textarea.readOnly = false;
  shell.content.append(feedbackField.wrapper);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'c2a-secondary-button';
  closeButton.textContent = 'Close';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'c2a-primary-button';
  copyButton.textContent = 'Copy feedback for ChatGPT';

  shell.footer.append(closeButton, copyButton);

  const finish = () => {
    closeModal();
    document.removeEventListener('keydown', onKeyDown, true);
  };

  async function copyFeedback() {
    try {
      await copyTextToClipboard(feedbackField.textarea.value);
      showToast('Copied edit feedback to clipboard. Paste it into ChatGPT if you want me to learn from it in this chat.');
    } catch (error) {
      showError('Could not copy feedback to clipboard.', error.message || String(error));
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') finish();
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') copyFeedback();
  }

  shell.backdrop.addEventListener('click', finish);
  shell.closeButton.addEventListener('click', finish);
  closeButton.addEventListener('click', finish);
  copyButton.addEventListener('click', copyFeedback);
  document.addEventListener('keydown', onKeyDown, true);

  feedbackField.textarea.focus();
  feedbackField.textarea.select();
}

function showToast(text, isError = false, timeoutMs = 5000) {
  const toast = document.createElement('div');
  toast.className = `c2a-toast ${isError ? 'c2a-error' : 'c2a-success'}`;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), timeoutMs);
}

function getSettings() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get({ diagnosticsEnabled: false }, resolve);
    } catch (error) {
      resolve({ diagnosticsEnabled: false });
    }
  });
}

async function showDiagnostic(text) {
  const settings = await getSettings();
  if (settings.diagnosticsEnabled) showToast(`Diagnostic: ${text}`, false, 7000);
}

async function showError(text, details = '') {
  const settings = await getSettings();
  const message = settings.diagnosticsEnabled && details ? `${text}\n\n${details}` : text;
  showToast(message, true, settings.diagnosticsEnabled ? 9000 : 6000);
}

function closeModal() {
  const existing = document.getElementById('c2a-modal-root');
  if (existing) existing.remove();
}

function buildTextInput(label, value, options = {}) {
  const wrapper = document.createElement('label');
  wrapper.className = options.compact ? 'c2a-field c2a-field-compact' : 'c2a-field';

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

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'c2a-icon-button';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.textContent = '×';

  header.append(titleBlock, closeButton);

  const content = document.createElement('div');
  content.className = 'c2a-modal-content';

  const footer = document.createElement('div');
  footer.className = 'c2a-modal-footer';

  modal.append(header, content, footer);
  root.append(backdrop, modal);
  document.body.appendChild(root);

  return { root, backdrop, modal, closeButton, content, footer };
}

function promptForManualJson() {
  return new Promise((resolve) => {
    const shell = makeModalShell(
      'Paste Anki JSON',
      'No marked card was found on the page. Paste a marked ANKI_NOTE_JSON block or raw Anki note JSON here.'
    );

    const jsonField = buildTextarea('Anki JSON', '', {
      rows: 14,
      spellcheck: false,
      placeholder: `${START_MARKER}\n{\n  "deckName": "ChatGPT Flashcards",\n  "modelName": "Basic",\n  "fields": {\n    "Front": "...",\n    "Back": "..."\n  },\n  "tags": ["..."]\n}\n${END_MARKER}`
    });

    const hint = document.createElement('p');
    hint.className = 'c2a-edit-hint';
    hint.textContent = 'Shortcut: Ctrl/⌘ + Enter parses this JSON. Escape cancels.';

    shell.content.append(jsonField.wrapper, hint);

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'c2a-secondary-button';
    cancelButton.textContent = 'Cancel';

    const parseButton = document.createElement('button');
    parseButton.type = 'button';
    parseButton.className = 'c2a-primary-button';
    parseButton.textContent = 'Preview this card';

    shell.footer.append(cancelButton, parseButton);

    const finish = (note) => {
      closeModal();
      document.removeEventListener('keydown', onKeyDown, true);
      resolve(note);
    };

    const tryParse = () => {
      try {
        const note = parseNoteFromAnyText(jsonField.textarea.value);
        finish(note);
      } catch (error) {
        showError('Could not parse that Anki JSON.', error.message || String(error));
      }
    };

    function onKeyDown(event) {
      if (event.key === 'Escape') finish(null);
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') tryParse();
    }

    shell.backdrop.addEventListener('click', () => finish(null));
    shell.closeButton.addEventListener('click', () => finish(null));
    cancelButton.addEventListener('click', () => finish(null));
    parseButton.addEventListener('click', tryParse);
    document.addEventListener('keydown', onKeyDown, true);

    jsonField.textarea.focus();
  });
}

function confirmNoteWithModal(note) {
  return new Promise((resolve) => {
    const preview = getNotePreview(note);
    const shell = makeModalShell(
      'Edit and save flashcard to Anki',
      'Make any changes you want. These edited values are what will be saved.'
    );

    const deckField = buildTextInput('Deck', preview.deckName, { compact: true });
    const modelField = buildTextInput('Model', preview.modelName, { compact: true });
    const tagsField = buildTextInput('Tags', preview.tags, { compact: true });

    const meta = document.createElement('div');
    meta.className = 'c2a-edit-grid';
    meta.append(deckField.wrapper, modelField.wrapper, tagsField.wrapper);

    const frontField = buildTextarea('Front', preview.front, { rows: 4 });
    const backField = buildTextarea('Back', preview.back, { rows: 7 });

    const hint = document.createElement('p');
    hint.className = 'c2a-edit-hint';
    hint.textContent = 'Shortcut: Ctrl/⌘ + Enter saves. Escape cancels.';

    shell.content.append(meta, frontField.wrapper, backField.wrapper, hint);

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'c2a-secondary-button';
    cancelButton.textContent = 'Cancel';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'c2a-primary-button';
    saveButton.textContent = 'Save edited card to Anki';

    shell.footer.append(cancelButton, saveButton);

    const collectValues = () => ({
      deckName: deckField.input.value,
      modelName: modelField.input.value,
      tags: tagsField.input.value,
      front: frontField.textarea.value,
      back: backField.textarea.value
    });

    const finish = (editedNote) => {
      closeModal();
      document.removeEventListener('keydown', onKeyDown, true);
      resolve(editedNote);
    };

    const trySave = () => {
      const values = collectValues();
      if (!values.front.trim() || !values.back.trim()) {
        showToast('Front and Back cannot be empty.', true);
        return;
      }
      finish(buildEditedNote(note, values));
    };

    function onKeyDown(event) {
      if (event.key === 'Escape') finish(null);
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') trySave();
    }

    shell.backdrop.addEventListener('click', () => finish(null));
    shell.closeButton.addEventListener('click', () => finish(null));
    cancelButton.addEventListener('click', () => finish(null));
    saveButton.addEventListener('click', trySave);
    document.addEventListener('keydown', onKeyDown, true);

    frontField.textarea.focus();
    frontField.textarea.select();
  });
}

async function saveLatestCard() {
  await showDiagnostic('Save command received. Searching for latest Anki JSON block.');
  const result = findLatestNote();
  let note = result.note;

  if (!note) {
    await showDiagnostic(`No page card found. Source=${result.source}${result.error ? `; ${result.error.message}` : ''}. Opening manual paste fallback.`);
    note = await promptForManualJson();
    if (!note) return;
  } else {
    await showDiagnostic(`Found Anki JSON block via ${result.source}. Opening editable preview.`);
  }

  const editedNote = await confirmNoteWithModal(note);
  if (!editedNote) return;

  await showDiagnostic('Sending edited note to AnkiConnect.');
  chrome.runtime.sendMessage({ type: 'ADD_ANKI_NOTE', note: editedNote }, (response) => {
    if (chrome.runtime.lastError) {
      showError('Could not contact the extension background service worker.', chrome.runtime.lastError.message);
      return;
    }

    if (response?.ok) {
      showPostSaveModal(note, editedNote, response.noteId);
    } else {
      showError('Failed to save to Anki.', response?.error || 'Unknown error from AnkiConnect.');
    }
  });
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
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    saveLatestCard();
  });
  document.body.appendChild(button);
}

function startSelfHealingButton() {
  addButton();

  if (!c2aButtonObserver) {
    let queued = false;
    c2aButtonObserver = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        addButton();
      });
    });
    c2aButtonObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (!c2aButtonWatchdog) {
    c2aButtonWatchdog = setInterval(() => {
      if (location.href !== c2aLastUrl) {
        c2aLastUrl = location.href;
        showDiagnostic(`URL changed: ${location.href}`);
      }
      addButton();
    }, 1500);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'OPEN_ANKI_SAVE_DIALOG') return false;
  saveLatestCard();
  sendResponse({ ok: true });
  return false;
});

startSelfHealingButton();
