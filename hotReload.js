const connection = new WebSocket('ws://{{host}}:{{port}}');

connection.onmessage = message => {
  if (message.data === 'RELOAD_EXTENSION') {
    chrome.tabs.reload();
    chrome.runtime.reload();
  }
};
