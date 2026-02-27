#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const electron = require('electron');
const appPath = path.join(__dirname, 'main.js');

// Pass through all arguments after the script name
const args = process.argv.slice(2);

spawn(electron, [appPath, '--no-sandbox', '--', ...args], {
  stdio: 'inherit'
});
