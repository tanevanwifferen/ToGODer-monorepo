import SwiftUI

struct ShareChatView: View {
    let chat: Chat
    let apiClient: APIClient

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var description = ""
    @State private var visibility = "PUBLIC"
    @State private var isSharing = false
    @State private var shareURL: String?
    @State private var error: String?
    @State private var copied = false

    init(chat: Chat, apiClient: APIClient) {
        self.chat = chat
        self.apiClient = apiClient
        _title = State(initialValue: chat.displayTitle)
    }

    var body: some View {
        NavigationStack {
            Form {
                if let shareURL {
                    sharedSection(url: shareURL)
                } else {
                    formSection
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("Share Conversation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                if shareURL == nil {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Share") {
                            Task { await share() }
                        }
                        .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSharing)
                    }
                } else {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
            }
            .interactiveDismissDisabled(isSharing)
        }
    }

    // MARK: - Form

    private var formSection: some View {
        Group {
            Section("Details") {
                TextField("Title", text: $title)
                TextField("Description (optional)", text: $description)
            }

            Section("Visibility") {
                Picker("Visibility", selection: $visibility) {
                    Text("Public").tag("PUBLIC")
                    Text("Private").tag("PRIVATE")
                }
                .pickerStyle(.segmented)
            }

            Section {
                HStack {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .foregroundStyle(.secondary)
                    Text("\(chat.activeMessages.count) messages")
                        .foregroundStyle(.secondary)
                }
            }

            if isSharing {
                Section {
                    HStack {
                        ProgressView()
                            .controlSize(.small)
                        Text("Sharing...")
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    // MARK: - Shared Result

    private func sharedSection(url: String) -> some View {
        Section("Share Link") {
            VStack(alignment: .leading, spacing: 12) {
                Text(url)
                    .font(.callout.monospaced())
                    .textSelection(.enabled)

                Button {
                    UIPasteboard.general.string = url
                    copied = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        copied = false
                    }
                } label: {
                    Label(copied ? "Copied!" : "Copy Link", systemImage: copied ? "checkmark" : "doc.on.doc")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    // MARK: - Actions

    private func share() async {
        isSharing = true
        error = nil
        defer { isSharing = false }

        let messages = chat.activeMessages.map { msg in
            SignedMessage(
                message: .init(role: msg.role.rawValue, content: msg.content),
                signature: msg.signature ?? ""
            )
        }

        let request = ShareRequest(
            messages: messages,
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            description: description.isEmpty ? nil : description.trimmingCharacters(in: .whitespacesAndNewlines),
            visibility: visibility
        )

        do {
            let sharedChat: SharedChat = try await apiClient.post("/share", body: request)
            shareURL = Configuration.shareBaseURL.appendingPathComponent(sharedChat.id).absoluteString
        } catch {
            self.error = error.localizedDescription
        }
    }
}
