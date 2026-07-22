import SwiftUI

/// Sheet for sharing an individual artifact via the backend /share/artifact endpoint.
struct ShareArtifactView: View {
    let artifactName: String
    let artifactContent: String
    let apiClient: APIClient

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var description = ""
    @State private var visibility = "PUBLIC"
    @State private var isSharing = false
    @State private var shareURL: String?
    @State private var error: String?
    @State private var copied = false

    init(artifactName: String, artifactContent: String, apiClient: APIClient) {
        self.artifactName = artifactName
        self.artifactContent = artifactContent
        self.apiClient = apiClient
        _title = State(initialValue: artifactName)
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
            .navigationTitle("Share Artifact")
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
                    Image(systemName: "doc.text")
                        .foregroundStyle(.secondary)
                    Text(artifactName)
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

        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            // Step 1: Get a server-issued signature for the artifact content
            let signReq = ArtifactSignRequest(title: trimmedTitle, content: artifactContent)
            let signResponse: ArtifactSignResponse = try await apiClient.post("/share/artifact/sign", body: signReq)

            // Step 2: Share the artifact with the signature
            let request = ShareArtifactRequest(
                title: trimmedTitle,
                description: description.isEmpty ? nil : description.trimmingCharacters(in: .whitespacesAndNewlines),
                content: artifactContent,
                visibility: visibility,
                artifactSignature: signResponse.signature
            )

            let shared: SharedArtifact = try await apiClient.post("/share/artifact", body: request)
            shareURL = Configuration.shareBaseURL.appendingPathComponent("artifact/\(shared.id)").absoluteString
        } catch {
            self.error = error.localizedDescription
        }
    }
}
