#Requires AutoHotkey v2.0

::;ankisetup::{
    oldClip := ClipboardAll()

    A_Clipboard := '
(
When I ask for a flashcard, please output a single concise Anki card using this exact format. Please do not make flashcards unless I ask.

ANKI_NOTE_JSON_START
{
  "deckName": "ChatGPT Flashcards",
  "modelName": "Basic",
  "fields": {
    "Front": "one clear question",
    "Back": "concise answer"
  },
  "tags": ["relevant-tags"]
}
ANKI_NOTE_JSON_END

I have a browser extension which handles saving to Anki. Do not try to do anything else.

Please condense the information in the preceding conversation into a flashcard.
)'

    ClipWait 1
    Send "^v"
    Sleep 100
    A_Clipboard := oldClip
}

::;fc::Please condense that into an Anki flashcard.