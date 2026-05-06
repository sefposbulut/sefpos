const { spawn } = require('child_process');
const path = require('path');

console.log('Starting ŞefPOS development server...');

// Start Vite dev server
const vite = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', '5180'], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname
});

vite.on('close', (code) => {
  console.log(`Vite server exited with code ${code}`);
});

vite.on('error', (error) => {
  console.error('Failed to start server:', error);
});
