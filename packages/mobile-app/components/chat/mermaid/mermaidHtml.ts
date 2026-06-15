/**
 * Builds a self-contained HTML document that renders a single Mermaid diagram.
 *
 * The diagram source is passed via `decodeURIComponent` of an encoded string so
 * that arbitrary diagram text can never break out of the JS string literal.
 * Mermaid runs with `securityLevel: 'strict'` and the document is loaded inside
 * an isolated WebView / sandboxed iframe, so untrusted (LLM-authored) diagram
 * text cannot execute script in the host app.
 *
 * When rendering finishes the document reports its content height back to the
 * host so the native WebView / iframe can be sized to fit:
 *   - React Native WebView: `window.ReactNativeWebView.postMessage(json)`
 *   - Web iframe:           `window.parent.postMessage(json, '*')`
 * Both send `{ type: 'mermaid-height', height: <px> }`.
 */
// Pinned to an exact, immutable version with a Subresource Integrity hash so a
// CDN compromise (or a malicious republish under a floating tag) cannot swap in
// attacker-controlled JS: a hash mismatch blocks the script and we fall back to
// showing the raw diagram source. To bump the version, update both the URL and
// the hash (e.g. `curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A`).
const MERMAID_VERSION = "11.15.0";
const MERMAID_CDN = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`;
const MERMAID_SRI =
  "sha384-yQ4mmBBT+vhTAwjFH0toJXNYJ6O4usWnt6EPIdWwrRvx2V/n5lXuDZQwQFeSFydF";

export function buildMermaidHtml(code: string, isDark: boolean): string {
  const theme = isDark ? "dark" : "default";
  const bg = isDark ? "#1E1E1E" : "#F5F5F5";
  const fg = isDark ? "#E6E6E6" : "#1A1A1A";
  const encoded = encodeURIComponent(code);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; background: ${bg}; color: ${fg}; }
  body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; }
  #wrap { padding: 10px; box-sizing: border-box; overflow-x: auto; }
  #diagram { display: flex; justify-content: center; }
  #diagram svg { max-width: 100%; height: auto; }
  pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.4; margin: 0; }
  .err { color: #d9534f; }
</style>
</head>
<body>
<div id="wrap"><div id="diagram"></div></div>
<script src="${MERMAID_CDN}" integrity="${MERMAID_SRI}" crossorigin="anonymous"></script>
<script>
  (function () {
    var code = decodeURIComponent("${encoded}");
    var diagram = document.getElementById("diagram");

    function escapeHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function postHeight() {
      var wrap = document.getElementById("wrap");
      var h = wrap ? wrap.scrollHeight : document.body.scrollHeight;
      var msg = JSON.stringify({ type: "mermaid-height", height: h });
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(msg);
      } else if (window.parent) {
        window.parent.postMessage(msg, "*");
      }
    }
    function showFallback(prefix) {
      diagram.innerHTML =
        '<pre>' + (prefix ? '<span class="err">' + escapeHtml(prefix) + '</span>\\n\\n' : '') +
        escapeHtml(code) + '</pre>';
      setTimeout(postHeight, 30);
    }

    function run() {
      if (typeof mermaid === "undefined") { showFallback("Diagram library unavailable"); return; }
      try {
        mermaid.initialize({ startOnLoad: false, theme: "${theme}", securityLevel: "strict" });
        mermaid.render("mmd", code)
          .then(function (res) {
            diagram.innerHTML = res.svg;
            setTimeout(postHeight, 30);
          })
          .catch(function (err) {
            showFallback(String((err && err.message) || err));
          });
      } catch (e) {
        showFallback(String((e && e.message) || e));
      }
    }

    if (document.readyState === "complete") { run(); }
    else { window.addEventListener("load", run); }
  })();
</script>
</body>
</html>`;
}
