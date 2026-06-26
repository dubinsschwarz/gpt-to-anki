const diagnosticsCheckbox = document.getElementById('diagnostics');
const feedbackDefaultCheckbox = document.getElementById('feedback-default');
const status = document.getElementById('status');

const defaults = {
  diagnosticsEnabled: false,
  feedbackDefaultEnabled: false
};

function showStatus(text) {
  status.textContent = text;
  setTimeout(() => { status.textContent = ''; }, 1800);
}

chrome.storage.sync.get(defaults, (settings) => {
  diagnosticsCheckbox.checked = Boolean(settings.diagnosticsEnabled);
  feedbackDefaultCheckbox.checked = Boolean(settings.feedbackDefaultEnabled);
});

diagnosticsCheckbox.addEventListener('change', () => {
  chrome.storage.sync.set({ diagnosticsEnabled: diagnosticsCheckbox.checked }, () => {
    showStatus(diagnosticsCheckbox.checked ? 'Diagnostics enabled.' : 'Diagnostics disabled.');
  });
});

feedbackDefaultCheckbox.addEventListener('change', () => {
  chrome.storage.sync.set({ feedbackDefaultEnabled: feedbackDefaultCheckbox.checked }, () => {
    showStatus(feedbackDefaultCheckbox.checked ? 'Edit feedback default enabled.' : 'Edit feedback default disabled.');
  });
});
