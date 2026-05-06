const { spawn } = require('child_process');
const path = require('path');

console.log('Starting ŞefPOS development server...');

// Start Vite dev server with proper configuration
const vite = spawn('node', [
  './node_modules/.bin/vite',
  '--host', '0.0.0.0',
  '--port', '5180',
  '--clear-screen',
  '--force'
], {
  stdio: 'inherit',
  shell: false,
  cwd: __dirname,
  env: {
    ...process.env,
    NODE_ENV: 'development'
  }
});

vite.on('close', (code) => {
  console.log(`Vite server exited with code ${code}`);
  if (code !== 0) {
    console.error('Server exited with error. Check the logs above for details.');
  }
});

vite.on('error', (error) => {
  console.error('Failed to start server:', error);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  vite.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  vite.kill('SIGTERM');
});
