import SwiftUI
import WebKit

struct MessageBubble: View {
    let message: ChatMessage
    let onEdit: (() -> Void)?
    let onDelete: (() -> Void)?
    var onRegenerate: (() -> Void)? = nil
    var onRetry: (() -> Void)? = nil
    @State private var showActions = false

    var body: some View {
        HStack(alignment: .top) {
            if message.isUser { Spacer(minLength: 60) }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 6) {
                MermaidMessageText(content: message.content, isUser: message.isUser)

                if let timestamp = message.timestamp {
                    Text(timestamp, style: .time)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            .contextMenu {
                if let onEdit = onEdit, message.isUser {
                    Button {
                        onEdit()
                    } label: {
                        Label("Edit", systemImage: "pencil")
                    }
                }

                Button {
                    UIPasteboard.general.string = message.content
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }

                if let onRegenerate = onRegenerate {
                    Button {
                        onRegenerate()
                    } label: {
                        Label("Regenerate", systemImage: "arrow.clockwise")
                    }
                }

                if let onRetry = onRetry {
                    Button {
                        onRetry()
                    } label: {
                        Label("Retry", systemImage: "arrow.counterclockwise")
                    }
                }

                if let onDelete = onDelete {
                    Button(role: .destructive) {
                        onDelete()
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }

            if !message.isUser { Spacer(minLength: 60) }
        }
    }
}

// MARK: - Mermaid-aware message text

/// Renders message content with inline Mermaid diagrams: prose is shown in a
/// chat bubble and each ```mermaid block becomes a rendered diagram. Shared by
/// the live chat (MessageBubble) and the shared-conversation read view.
struct MermaidMessageText: View {
    let content: String
    let isUser: Bool

    var body: some View {
        let parts = MermaidParser.parse(content)
        // Fast path: no diagrams -> a single text bubble.
        if parts.count == 1, case .text = parts[0] {
            bubble(content)
        } else {
            VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
                ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                    switch part {
                    case .text(let value):
                        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !trimmed.isEmpty {
                            bubble(trimmed)
                        }
                    case .mermaid(let code):
                        MermaidView(code: code)
                    }
                }
            }
        }
    }

    private func bubble(_ text: String) -> some View {
        Text(text)
            .textSelection(.enabled)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(isUser ? Color.blue : Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

// MARK: - Mermaid parsing

enum MermaidSegment {
    case text(String)
    case mermaid(String)
}

enum MermaidParser {
    // Matches a closed ```mermaid ... ``` fenced block. `[\s\S]` matches across
    // newlines so the body can span multiple lines; the body is captured lazily.
    private static let regex = try? NSRegularExpression(
        pattern: "```mermaid[ \\t]*\\r?\\n([\\s\\S]*?)```"
    )

    /// Splits message content into ordered text and Mermaid segments. Only
    /// *closed* fences are treated as diagrams, so a diagram that is still
    /// streaming in renders as text until its closing fence arrives.
    static func parse(_ content: String) -> [MermaidSegment] {
        guard let regex else { return [.text(content)] }

        let ns = content as NSString
        let matches = regex.matches(
            in: content,
            range: NSRange(location: 0, length: ns.length)
        )
        if matches.isEmpty { return [.text(content)] }

        var segments: [MermaidSegment] = []
        var cursor = 0
        for match in matches {
            if match.range.location > cursor {
                let text = ns.substring(
                    with: NSRange(location: cursor, length: match.range.location - cursor)
                )
                segments.append(.text(text))
            }
            let code = ns.substring(with: match.range(at: 1))
                .trimmingCharacters(in: .whitespacesAndNewlines)
            segments.append(.mermaid(code))
            cursor = match.range.location + match.range.length
        }
        if cursor < ns.length {
            segments.append(.text(ns.substring(from: cursor)))
        }
        return segments
    }
}

// MARK: - Mermaid rendering

/// Renders a single Mermaid diagram in an isolated `WKWebView`, sizing itself to
/// the diagram's reported content height.
struct MermaidView: View {
    let code: String
    @Environment(\.colorScheme) private var colorScheme
    @State private var height: CGFloat = 80

    var body: some View {
        MermaidWebView(code: code, isDark: colorScheme == .dark, height: $height)
            .frame(height: height)
            .frame(maxWidth: .infinity)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private struct MermaidWebView: UIViewRepresentable {
    let code: String
    let isDark: Bool
    @Binding var height: CGFloat

    func makeCoordinator() -> Coordinator {
        Coordinator(height: $height)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(context.coordinator, name: "mermaidHeight")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.isScrollEnabled = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear

        let html = MermaidHTML.build(code: code, isDark: isDark)
        context.coordinator.lastHTML = html
        webView.loadHTMLString(html, baseURL: URL(string: "https://cdn.jsdelivr.net"))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let html = MermaidHTML.build(code: code, isDark: isDark)
        guard html != context.coordinator.lastHTML else { return }
        context.coordinator.lastHTML = html
        webView.loadHTMLString(html, baseURL: URL(string: "https://cdn.jsdelivr.net"))
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        @Binding var height: CGFloat
        var lastHTML: String = ""

        // Upper bound so semi-trusted (LLM-authored) content can't force an
        // absurdly tall cell in the chat.
        private let maxHeight: CGFloat = 5000

        init(height: Binding<CGFloat>) {
            _height = height
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "mermaidHeight" else { return }
            let value: CGFloat?
            if let number = message.body as? NSNumber {
                value = CGFloat(truncating: number)
            } else if let double = message.body as? Double {
                value = CGFloat(double)
            } else {
                value = nil
            }
            guard let h = value, h > 0 else { return }
            DispatchQueue.main.async {
                self.height = min(h + 6, self.maxHeight)
            }
        }

        // Defense-in-depth: allow the inline document and the pinned CDN script,
        // but cancel any attempt by in-page JS to navigate the WebView elsewhere.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            let scheme = url.scheme?.lowercased() ?? ""
            if scheme == "about" || scheme == "data" || url.host == "cdn.jsdelivr.net" {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
        }
    }
}

enum MermaidHTML {
    // Pinned to an exact, immutable version with a Subresource Integrity hash so
    // a CDN compromise cannot swap in attacker-controlled JS (a hash mismatch
    // blocks the script and we fall back to the raw diagram source). To bump,
    // update both the version and the hash:
    //   curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A
    private static let version = "11.15.0"
    private static let cdn = "https://cdn.jsdelivr.net/npm/mermaid@\(version)/dist/mermaid.min.js"
    private static let sri = "sha384-yQ4mmBBT+vhTAwjFH0toJXNYJ6O4usWnt6EPIdWwrRvx2V/n5lXuDZQwQFeSFydF"

    /// Builds a self-contained document that renders `code` as a Mermaid diagram
    /// and posts its height to the `mermaidHeight` script message handler.
    ///
    /// The diagram source is injected via `decodeURIComponent` of a percent-
    /// encoded string so arbitrary diagram text cannot break out of the JS
    /// literal, and Mermaid runs with `securityLevel: 'strict'`.
    static func build(code: String, isDark: Bool) -> String {
        let theme = isDark ? "dark" : "default"
        let bg = isDark ? "#1E1E1E" : "#F5F5F5"
        let fg = isDark ? "#E6E6E6" : "#1A1A1A"
        let encoded = code.addingPercentEncoding(
            withAllowedCharacters: .alphanumerics
        ) ?? ""

        return """
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          html, body { margin: 0; padding: 0; background: \(bg); color: \(fg); }
          body { font-family: -apple-system, system-ui, sans-serif; }
          #wrap { padding: 10px; box-sizing: border-box; overflow-x: auto; }
          #diagram { display: flex; justify-content: center; }
          #diagram svg { max-width: 100%; height: auto; }
          pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.4; margin: 0; }
          .err { color: #d9534f; }
        </style>
        </head>
        <body>
        <div id="wrap"><div id="diagram"></div></div>
        <script src="\(cdn)" integrity="\(sri)" crossorigin="anonymous"></script>
        <script>
          (function () {
            var code = decodeURIComponent("\(encoded)");
            var diagram = document.getElementById("diagram");

            function escapeHtml(s) {
              return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }
            function postHeight() {
              var wrap = document.getElementById("wrap");
              var h = wrap ? wrap.scrollHeight : document.body.scrollHeight;
              if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.mermaidHeight) {
                window.webkit.messageHandlers.mermaidHeight.postMessage(h);
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
                mermaid.initialize({ startOnLoad: false, theme: "\(theme)", securityLevel: "strict" });
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
        </html>
        """
    }
}
