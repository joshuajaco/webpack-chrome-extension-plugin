const fs = require('fs');
const { resolve } = require('path');

const createBackgroundWorker = ({ host, port }) =>
  fs
    .readFileSync(resolve(__dirname, '../client/backgroundWorker.js'))
    .toString()
    .replace(/{{host}}/, host)
    .replace(/{{port}}/, port);

module.exports = createBackgroundWorker;
