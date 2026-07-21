import SwiftUI

/// Sheet for sharing an artifact folder via the backend /share/artifact endpoint.
/// Collects all descendant file content into a single combined artifact.
struct ShareFolderView: View {
    let folderName: String
    let folderId: String
    let projectId: String
    let artifactService: ArtifactService
    let apiClient: APIClient

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var description = ""
    @State private var visibility = "PUBLIC"
    @State private var isSharing = false
    @State private var shareURL: String?
    @State private var error: String?
    @State private var copied = false

    init(folderName: String, folderId: String, projectId: String, artifactService: ArtifactService, apiClient: APIClient) {
        self.folderName = folderName
        self.folderId = folderId
        self.projectId = projectId
        self.artifactService = artifactService
        self.apiClient = apiClient
        _title = State(initialValue: folderName)
    }

    /// Combine all descendant files into one Markdown-like document.
    private var combinedContent: String {
        collectFiles(parentId: folderId).map { file in
            "### \(file.name)\n```\n\(file.content ?? "")\n```\n"
        }.joined(separator: "\n")
    }

    private func collectFiles(parentId: String) -> [Artifact] {
        artifactService.childrenOf(parentId, projectId: projectId).flatMap { child in
            if child.type == .folder {
                return collectFiles(parentId: child.id)
            } else {
                return [child]
            }
        }
    }

    private var fileCount: Int {
        collectFiles(parentId: folderId).count
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
            .navigationTitle("Share Folder")
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
                    Image(systemName: "folder")
                        .foregroundStyle(.secondary)
                    Text("\(fileCount) file\(fileCount == 1 ? "" : "s") in \(folderName)")
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

    private func share() async {
        isSharing = true
        error = nil
        defer { isSharing = false }

        let request = ShareArtifactRequest(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            description: description.isEmpty ? nil : description.trimmingCharacters(in: .whitespacesAndNewlines),
            content: combinedContent,
            visibility: visibility
        )

        do {
            let shared: SharedArtifact = try await apiClient.post("/share/artifact", body: request)
            shareURL = Configuration.shareBaseURL.appendingPathComponent("artifact/\(shared.id)").absoluteString
        } catch {
            self.error = error.localizedDescription
        }
    }
}
