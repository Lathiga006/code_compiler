const languageSelect = document.getElementById('language-select');
const runButton = document.getElementById('run-button');
const formatButton = document.getElementById('format-button');
const saveButton = document.getElementById('save-button');
const loadButton = document.getElementById('load-button');
const resetButton = document.getElementById('reset-button');
const copyButton = document.getElementById('copy-button');
const clearConsoleButton = document.getElementById('clear-console-button');
const outputConsole = document.getElementById('output-console');
const statusLabel = document.getElementById('status-label');
const historyList = document.getElementById('history-list');
const codeEditor = document.getElementById('code-editor');

const HISTORY_STORAGE_KEY = 'miniCompilerRunHistory';

const defaultSamples = {
  javascript: `console.log('Hello, JavaScript!');`,
  python: `print('Hello, Python!')`,
  c: `#include <stdio.h>\n\nint main() {\n    printf("Hello, C!\n");\n    return 0;\n}`,
  cpp: `#include <iostream>\n\nint main() {\n    std::cout << "Hello, C++!\n";\n    return 0;\n}`
};

let currentTheme = 'dark';

function getStorageKey(language) {
  return `miniCompilerCode:${language}`;
}


function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function storeHistory(history) {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 40)));
}

function updateHistoryDisplay() {
  const history = getHistory();
  historyList.innerHTML = history.length === 0 ? '<p class="empty-state">Run code to see history here.</p>' : '';

  history.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'history-entry';
    const statusClass = entry.success ? '' : 'error';
    item.innerHTML = `
      <strong>${entry.language}<span class="history-status ${statusClass}">${entry.success ? 'Success' : 'Error'}</span></strong>
      <small>${entry.time}</small>
      <div>${entry.summary}</div>
    `;
    historyList.appendChild(item);
  });
}

function getEditorCode() {
  return codeEditor.value;
}

function setEditorCode(value) {
  codeEditor.value = value;
}


function loadLanguageCode(language) {
  const saved = localStorage.getItem(getStorageKey(language));
  setEditorCode(saved || defaultSamples[language]);
}

async function saveCode() {
  const language = languageSelect.value;
  localStorage.setItem(getStorageKey(language), getEditorCode());
  showStatus('Code saved locally');
}

function loadCode() {
  const language = languageSelect.value;
  const saved = localStorage.getItem(getStorageKey(language));
  if (saved) {
    setEditorCode(saved);
    showStatus('Loaded saved code');
  } else {
    showStatus('No saved code found for this language');
  }
}

function resetCode() {
  setEditorCode(defaultSamples[languageSelect.value]);
  showStatus('Default code restored');
}

function showStatus(message, isError = false) {
  statusLabel.textContent = message;
  statusLabel.style.color = isError ? 'var(--error)' : 'var(--success)';
}

async function runCode() {
  const language = languageSelect.value;
  const code = getEditorCode().trim();
  if (!code) {
    showError('Enter code before running');
    return;
  }

  runButton.disabled = true;
  outputConsole.classList.remove('error');
  outputConsole.textContent = 'Running...';
  showStatus('Running code...', false);

  try {
    const resp = await fetch('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, code })
    });
    const result = await resp.json();
    const parts = [];
    if (result.stdout) parts.push(result.stdout);
    if (result.stderr) parts.push(result.stderr);
    parts.push(`Exit code: ${result.exitCode}`);
    if (result.timedOut) parts.push('Execution timed out.');
    outputConsole.textContent = parts.join('\n').trim();
    const success = result.exitCode === 0 && !result.timedOut;
    if (!success) outputConsole.classList.add('error');
    addHistory({
      language,
      time: new Date().toLocaleString(),
      summary: success ? 'Ran successfully' : 'Error or non-zero exit',
      success
    });
    showStatus(success ? 'Run completed' : 'Run completed with errors', !success);
  } catch (error) {
    outputConsole.textContent = `Error: ${error.message}`;
    outputConsole.classList.add('error');
    addHistory({
      language,
      time: new Date().toLocaleString(),
      summary: error.message,
      success: false
    });
    showStatus('Network or server error', true);
  } finally {
    runButton.disabled = false;
  }
}

function addHistory(entry) {
  const history = getHistory();
  history.unshift(entry);
  storeHistory(history);
  updateHistoryDisplay();
}

function showError(message) {
  outputConsole.textContent = message;
  outputConsole.classList.add('error');
  showStatus(message, true);
}

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(outputConsole.textContent || '');
    showStatus('Output copied');
  } catch {
    showError('Could not copy output');
  }
}

function clearConsole() {
  outputConsole.textContent = '';
  outputConsole.classList.remove('error');
  showStatus('Console cleared');
}

function formatCurrentCode() {
  codeEditor.value = codeEditor.value.replace(/\t/g, '    ');
  showStatus('Basic indentation applied');
}

codeEditor.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    const start = codeEditor.selectionStart;
    const end = codeEditor.selectionEnd;
    codeEditor.value = codeEditor.value.substring(0, start) + '    ' + codeEditor.value.substring(end);
    codeEditor.selectionStart = codeEditor.selectionEnd = start + 4;
  }
});

function start() {
  loadLanguageCode(languageSelect.value);
  updateHistoryDisplay();
  showStatus('Ready');
}

languageSelect.addEventListener('change', () => {
  loadLanguageCode(languageSelect.value);
  showStatus(`Language changed to ${languageSelect.value}`);
});

runButton.addEventListener('click', runCode);
formatButton.addEventListener('click', formatCurrentCode);
saveButton.addEventListener('click', saveCode);
loadButton.addEventListener('click', loadCode);
resetButton.addEventListener('click', resetCode);
copyButton.addEventListener('click', copyOutput);
clearConsoleButton.addEventListener('click', clearConsole);

start();
