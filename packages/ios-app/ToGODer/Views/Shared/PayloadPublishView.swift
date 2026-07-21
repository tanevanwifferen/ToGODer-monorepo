import SwiftUI

/// Admin-only sheet for publishing to the Payload website.
/// Calls the backend endpoint that marks content for Payload to fetch.
struct PayloadPublishView: View {
    enum ContentType: String {
        case conversation = "conversation"
        case artifact = "artifact"
        case folder = "folder"

        var label: String {
            switch self {
            case .conversation: return "Conversation"
            case .artifact: return "Artifact"
            case .folder: return "Folder"
            }
        }
    }

    let contentType: ContentType
    let contentId: String
    let contentTitle: String
    let apiClient: APIClient

    @Environment(\.dismiss) private var dismiss
    @State private var isPublishing = false
    @State private var error: String?
    @State private var published = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Image(systemName: "paperplane.fill")
                            .foregroundStyle(.blue)
                        Text("Publish \"\(contentTitle)\" to Payload")
                            .font(.headline)
                    }
                }

                Section {
                    LabeledContent("Type", value: contentType.label)
                    LabeledContent("ID", value: contentId)
                }

                if isPublishing {
                    Section {
                        HStack {
                            ProgressView()
                                .controlSize(.small)
                            Text("Publishing...")
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if published {
                    Section {
                        Label("Published successfully!", systemImage: "checkmark.circle")
                            .foregroundStyle(.green)
                    }
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }

                if !published {
                    Section {
                        Button {
                            Task { await publish() }
                        } label: {
                            Label("Publish to Payload", systemImage: "paperplane.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(isPublishing)
                    }
                }
            }
            .navigationTitle("Publish to Payload")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(published ? "Done" : "Cancel") { dismiss() }
                }
            }
            .interactiveDismissDisabled(isPublishing)
        }
    }

    private func publish() async {
        isPublishing = true
        error = nil
        defer { isPublishing = false }

        do {
            let path: String
            switch contentType {
            case .conversation:
                path = "/admin/payload/chat/\(contentId)/mark"
            case .artifact:
                path = "/admin/payload/artifact/\(contentId)/mark"
            case .folder:
                path = "/admin/payload/folder/\(contentId)/mark"
            }
            // Fire-and-forget POST to the admin Payload mark endpoint
            let _: [String: String]? = try await apiClient.post(path, body: EmptyBody())
            published = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}
