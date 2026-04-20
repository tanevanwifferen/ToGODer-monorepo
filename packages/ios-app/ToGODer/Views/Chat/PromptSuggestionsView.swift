import SwiftUI

struct PromptSuggestionsView: View {
    let inputText: String
    let prompts: [String: PromptOption]
    let hasCustomPrompt: Bool
    let onSelect: (String) -> Void

    private var shouldShow: Bool {
        inputText.hasPrefix("/") && !inputText.contains(" ")
    }

    private var filterText: String {
        String(inputText.dropFirst()).lowercased()
    }

    private var filteredPrompts: [(key: String, value: PromptOption)] {
        var results = prompts.filter { key, _ in
            filterText.isEmpty || key.lowercased().contains(filterText)
        }
        .sorted { $0.key < $1.key }

        if hasCustomPrompt && (filterText.isEmpty || "custom".contains(filterText)) {
            let customOption = PromptOption(prompt: "", description: "Use your custom system prompt", display: nil)
            results.insert((key: "custom", value: customOption), at: 0)
        }

        return results
    }

    var body: some View {
        if shouldShow && !filteredPrompts.isEmpty {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(filteredPrompts.enumerated()), id: \.element.key) { index, entry in
                        Button {
                            onSelect("/\(entry.key)")
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("/\(entry.key)")
                                    .font(.body)
                                    .fontWeight(.medium)
                                    .foregroundStyle(.primary)

                                if let description = entry.value.description ?? entry.value.display {
                                    Text(description)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal)
                            .padding(.vertical, 8)
                        }

                        if index < filteredPrompts.count - 1 {
                            Divider()
                                .padding(.leading)
                        }
                    }
                }
            }
            .frame(maxHeight: 200)
            .background(.ultraThinMaterial)
        }
    }
}
