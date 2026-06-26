# ChatGPT to Anki v0.1.7

Prototype browser extension for saving approved ChatGPT flashcard JSON blocks to Anki via local AnkiConnect.

## What changed in v0.1.7

Reliability update:

- The floating button is now self-healing. If ChatGPT replaces page content during navigation, the extension periodically checks and re-injects the button if needed.
- If no marked Anki JSON block is found, the extension opens a manual paste fallback instead of only showing an error.
- Optional diagnostic messages can be enabled from the extension popup.

The keyboard shortcut remains:

- **Ctrl+Shift+F** opens the same save dialog as the floating **Save latest Anki card** button on ChatGPT pages.

The modal shortcuts remain:

- **Ctrl+Enter** saves/parses while a dialog is open.
- **Escape** cancels/closes the dialog.

If Chrome does not assign or enable the shortcut automatically, open `chrome://extensions/shortcuts`, find **ChatGPT to Anki**, and set **Open the Save latest Anki card dialog** to `Ctrl+Shift+F`.

## Install

1. Unzip this folder somewhere stable.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode.
4. Click **Load unpacked**.
5. Select the unzipped `chatgpt-anki-extension` folder.
6. Keep Anki open with AnkiConnect installed.

## Optional diagnostics

Click the extension icon in the browser toolbar and tick **Show diagnostic messages**. This makes the extension show extra messages about whether it found a card block, opened the manual fallback, or sent a note to AnkiConnect.

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
4. If no card is found, paste a marked block or raw JSON into the fallback dialog.
5. Click **Save edited card to Anki**, or press **Ctrl+Enter** while the dialog is open.
