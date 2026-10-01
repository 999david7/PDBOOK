// Bridge to the macOS shell (macos/ — a WKWebView app). In a normal browser
// `native.active` is false and every call is a no-op.
const handler = window.webkit?.messageHandlers?.pdbook;

export const native = {
  active: Boolean(handler && window.PDBOOK_NATIVE),
  post(type, data = {}) {
    try {
      handler?.postMessage({ type, ...data });
    } catch {
      // Not running inside the app.
    }
  },
};

if (native.active) document.documentElement.classList.add('native');
