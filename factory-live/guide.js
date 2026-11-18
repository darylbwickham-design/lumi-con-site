const preset = document.getElementById('preset');
const triggerCommand = document.getElementById('trigger-command');
const webhookBody = document.getElementById('webhook-body');
const feedback = document.getElementById('copy-feedback');

function updatePreset() {
  triggerCommand.textContent = 'node bridge.mjs trigger ' + preset.value;
  webhookBody.textContent = JSON.stringify({ preset: preset.value });
}

preset.addEventListener('change', updatePreset);
updatePreset();

for (const button of document.querySelectorAll('[data-copy]')) {
  const snippet = document.getElementById(button.dataset.copy);
  let resetTimer;
  button.hidden = false;
  button.addEventListener('click', async () => {
    clearTimeout(resetTimer);
    try {
      await navigator.clipboard.writeText(snippet.textContent);
      button.textContent = 'Copied';
      feedback.textContent = 'Copied to clipboard.';
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(snippet);
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = 'Selected';
      feedback.textContent = 'Text selected. Press Ctrl+C or Command+C to copy.';
    }
    resetTimer = setTimeout(() => {
      button.textContent = 'Copy';
      feedback.textContent = '';
    }, 2200);
  });
}
