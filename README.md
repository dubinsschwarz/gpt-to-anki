# gpt-to-anki
A simple browser extension to automate the conversion of ChatGPT conversations into flashcards. Code written with GPT-5.5.

The extension creates a floating button which, when clicked, searches the conversation for a specific format of structured output (JSON) corresponding to a flashcard. If it finds a match, it brings up a dialog box which allows the user to review the proposed flashcard, edit it, and either discard it or save it to Anki. Anki is one of many flashcard applications.

ChatGPT can be instructed on how to format the JSON to the specification with custom instructions or in-context learning. I found that I prefer the latter, so I set up an AutoHotKey script for text expansions to streamline the process. The code for the script is the content of the .txt file in this repository.

This extension works well for me in Microsoft Edge. It may not work as well in Chrome or other browsers because I have not tested it with those browsers.

The setup takes five minutes. You should have the desktop app for Anki installed.

1. Download and unzip the .zip file.
2. Load the extension in your browser
   - Go to Extensions > Manage Extensions
   - Enable "Developer mode"
   - Click on "Load unpacked"
   - Select the unzipped extension folder
   You should then see the ChatGPT to Anki extension appear. Check that it also has the version number you expect.
   - Make note of the ID for the extension.
3. Install and configure AnkiConnect
   - Go to Tools > Add-ons
   - Click on "Get Add-ons..."
   - Enter this code to install AnkiConnect: "2055492159"
   - Click "OK"
   - Restart Anki
   - Go back to Tools > Add-ons
   - Select "AnkiConnect"
   - Click on "Config"
   - Add a line for your extension with your extension ID to webCorsOriginList
   Example:
   "webCorsOriginList": [
    "http://localhost",
    "http://127.0.0.1",
    "chrome-extension://YOUR_EXTENSION_ID_HERE"
  ]
   - Restart Anki again
 4. Create an Anki deck called "ChatGPT Flashcards" (default)
 5. (optional) Set a browser shortcut for the extension
    - Go to edge://extensions/shortcuts
    - Set "Open the Save latest Anki card dialog" to your preferred shortcut
 6. Test the extension. Does it work?
 7. (optional) Enable diagnostics
    - Go to Extensions
    - Click on the "ChatGPT to Anki" extension
    - Tick the box "Show diagnostic messages when opening/saving cards"
 8. Setup complete.
