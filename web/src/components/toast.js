import { $ } from '../dom.js';

export function showToast(message, type = 'ok') {
  const host = $('#toast-host');
  if (!host || !message) return;
  const toast = document.createElement('div');
  toast.className = `app-toast app-toast--${type === 'err' ? 'err' : 'ok'}`;
  toast.setAttribute('role', type === 'err' ? 'alert' : 'status');
  toast.textContent = message;
  host.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4200);
}
