/* global localStorage, document */
// Applies the saved theme before first paint to avoid a flash. Light is the default.
// A file rather than an inline script, so the production Content-Security-Policy allows it.
try {
  if (localStorage.getItem('spu-theme') === 'dark') document.documentElement.classList.add('dark');
} catch {
  // Storage blocked: stay light.
}
