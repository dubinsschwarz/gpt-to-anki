const checkbox = document.getElementById('diagnostics');
const status = document.getElementById('status');

chrome.storage.sync.get({ diagnosticsEnabled: false }, (settings) => {
  checkbox.checked = Boolean(settings.diagnosticsEnabled);
});

checkbox.addEventListener('change', () => {
  chrome.storage.sync.set({ diagnosticsEnabled: checkbox.checked }, () => {
    status.textContent = checkbox.checked ? 'Diagnostics enabled.' : 'Diagnostics disabled.';
    setTimeout(() => { status.textContent = ''; }, 1800);
  });
});
