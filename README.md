# ChatGPT to Anki v0.1.10

[Written by GPT-5.5.] Prototype browser extension for saving approved ChatGPT flashcard JSON blocks to Anki via local AnkiConnect.

## What changed in v0.1.10

Edit-feedback UX update:

- Edit feedback is now optional for each card from the save dialog.
- The per-card feedback checkbox is off by default unless changed in the extension popup.
- The extension popup now has a preference to tick edit feedback by default across future cards.
- If no edits were made, the extension saves the card without showing an edit-feedback screen.
- Keep Anki open while saving cards; the extension talks to local AnkiConnect.

The keyboard shortcut remains:

- **Ctrl+Shift+F** opens the same save dialog as the floating **Save latest Anki card** button on ChatGPT pages.

The modal shortcuts remain:

- **Ctrl+Enter** saves/parses while a dialog is open.
- **Escape** cancels/closes the dialog.

If Chrome or Edge does not assign or enable the shortcut automatically, open `chrome://extensions/shortcuts` or `edge://extensions/shortcuts`, find **ChatGPT to Anki**, and set **Open the Save latest Anki card dialog** to `Ctrl+Shift+F`.

## Install

1. Unzip this folder somewhere stable.
2. Open `chrome://extensions`, `edge://extensions`, or your Chromium browser's extensions page.
3. Enable Developer mode.
4. Click **Load unpacked**.
5. Select the unzipped `chatgpt-anki-extension` folder.
6. Keep Anki open with AnkiConnect installed.

## Extension options

Click the extension icon in the browser toolbar.

- **Show diagnostic messages when opening/saving cards**: shows extra information about card detection and save routing.
- **Tick edit feedback by default in the save dialog**: makes the per-card edit-feedback checkbox start checked. This is off by default.

## AnkiConnect CORS config

Copy the extension ID from your browser extensions page and add it to AnkiConnect's `webCorsOriginList`:

```json
{
  "apiKey": null,
  "apiLogPath": null,
  "ignoreOriginList": [],
  "webBindAddress": "127.0.0.1",
  "webBindPort": 8765,
  "webCorsOriginList": [
    "http://localhost",
    "http://127.0.0.1",
    "chrome-extension://YOUR_EXTENSION_ID"
  ]
}
```

Restart Anki after changing the config.

## Expected ChatGPT block format

```text
ANKI_NOTE_JSON_START
{
  "deckName": "ChatGPT Flashcards",
  "modelName": "Basic",
  "fields": {
    "Front": "Question here",
    "Back": "Answer here"
  },
  "tags": ["chatgpt", "anki"]
}
ANKI_NOTE_JSON_END
```

Friendly shape is also accepted:

```json
{
  "front": "Question here",
  "back": "Answer here",
  "tags": ["chatgpt", "anki"]
}
```

## Use

1. Reload ChatGPT after installing/reloading the extension.
2. Click **Save latest Anki card**, or press **Ctrl+Shift+F**.
3. If a card is found, edit the modal fields as desired.
4. Optionally tick **Show edit feedback after saving** if you want a copyable edit summary after saving.
5. If no card is found, paste a marked block or raw JSON into the fallback dialog.
6. Click **Save edited card to Anki**, or press **Ctrl+Enter** while the edit dialog is open.
7. If edit feedback was requested and edits were actually made, copy the generated feedback into the chat so ChatGPT can adapt in-context.
