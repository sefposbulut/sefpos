const TERMINAL_STORAGE = 'shefpos_terminal_mode';
export const TERMINAL_SESSION_KEY = 'shefpos_terminal_session';

export function isTerminalMode(): boolean {
  return localStorage.getItem(TERMINAL_STORAGE) === 'true';
}

export function exitTerminalMode(): void {
  localStorage.removeItem(TERMINAL_STORAGE);
  localStorage.removeItem(TERMINAL_SESSION_KEY);
}

export function enterTerminalMode(): void {
  localStorage.setItem(TERMINAL_STORAGE, 'true');
}
