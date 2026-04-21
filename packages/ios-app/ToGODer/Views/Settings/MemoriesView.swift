import SwiftUI

struct MemoriesView: View {
    @EnvironmentObject var memoryService: MemoryService
    @State private var showingAddSheet = false
    @State private var newKey = ""
    @State private var newValue = ""

    var body: some View {
        List {
            ForEach(memoryService.memoryKeys, id: \.self) { key in
                VStack(alignment: .leading, spacing: 4) {
                    Text(key)
                        .font(.headline)
                    Text(memoryService.memories[key] ?? "")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
                .padding(.vertical, 2)
            }
            .onDelete(perform: deleteMemories)
        }
        .navigationTitle("Memories")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingAddSheet = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingAddSheet) {
            NavigationStack {
                Form {
                    Section("Key") {
                        TextField("Topic or tag", text: $newKey)
                    }
                    Section("Value") {
                        TextEditor(text: $newValue)
                            .frame(minHeight: 100)
                    }
                }
                .navigationTitle("Add Memory")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            resetForm()
                            showingAddSheet = false
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            let trimmedKey = newKey.trimmingCharacters(in: .whitespacesAndNewlines)
                            let trimmedValue = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                            if !trimmedKey.isEmpty && !trimmedValue.isEmpty {
                                memoryService.updateMemory(key: trimmedKey, value: trimmedValue)
                            }
                            resetForm()
                            showingAddSheet = false
                        }
                        .disabled(newKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                                  newValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .overlay {
            if memoryService.memoryKeys.isEmpty {
                ContentUnavailableView(
                    "No Memories",
                    systemImage: "brain",
                    description: Text("Memories are created automatically from your conversations, or you can add them manually.")
                )
            }
        }
    }

    private func deleteMemories(at offsets: IndexSet) {
        for index in offsets {
            let key = memoryService.memoryKeys[index]
            memoryService.deleteMemory(key: key)
        }
    }

    private func resetForm() {
        newKey = ""
        newValue = ""
    }
}
