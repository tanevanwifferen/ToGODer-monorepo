import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var settingsService: SettingsService
    @EnvironmentObject var passcodeService: PasscodeService
    @EnvironmentObject var calendarService: CalendarService
    @EnvironmentObject var healthService: HealthService
    @EnvironmentObject var memoryService: MemoryService
    @EnvironmentObject var chatService: ChatService
    @State private var showPasscodeSetup = false
    @State private var isGeneratingPrompt = false
    @State private var promptError: String?

    var body: some View {
        Form {
            Section("AI Model") {
                Picker("Model", selection: modelBinding) {
                    ForEach(settingsService.availableModels) { model in
                        Text(model.title).tag(model.model)
                    }
                }
            }

            Section("Communication") {
                Picker("Style", selection: communicationStyleBinding) {
                    ForEach(CommunicationStyle.allCases) { style in
                        Text(style.displayName).tag(style)
                    }
                }

                TextField("Language", text: languageBinding)

                TextField("Assistant Name", text: assistantNameBinding)
            }

            Section("Behavior") {
                Toggle("Conversational Style", isOn: humanPromptBinding)
                Toggle("Keep Conversation Going", isOn: keepGoingBinding)
                Toggle("Think Outside the Box", isOn: outsideBoxBinding)
                Toggle("Holistic Therapist", isOn: holisticTherapistBinding)
                if settingsService.globalConfig?.libraryIntegrationEnabled == true {
                    Toggle("Library Integration", isOn: libraryBinding)
                }
            }

            Section("Memory") {
                NavigationLink {
                    MemoriesView()
                } label: {
                    HStack {
                        Text("Memories")
                        Spacer()
                        Text("\(memoryService.memoryKeys.count)")
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section("Calendar") {
                Toggle("Calendar Integration", isOn: calendarBinding)
            }

            Section("Health") {
                if healthService.isAvailable {
                    Toggle("HealthKit Integration", isOn: healthBinding)

                    if healthService.isAuthorized {
                        if let summary = healthService.healthSummary {
                            Text(summary)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            Text("No health data available yet.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                } else {
                    Text("HealthKit is not available on this device.")
                        .foregroundStyle(.secondary)
                }
            }

            Section("Persona") {
                TextEditor(text: personaBinding)
                    .frame(minHeight: 100)

                Text("\(settingsService.settings.persona?.count ?? 0)/1000")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Custom System Prompt") {
                if let prompt = settingsService.settings.customSystemPrompt, !prompt.isEmpty {
                    Text(prompt)
                        .font(.body)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    Text("No system prompt generated yet.")
                        .foregroundStyle(.secondary)
                }

                Button {
                    Task { await generateSystemPrompt() }
                } label: {
                    if isGeneratingPrompt {
                        HStack {
                            ProgressView()
                            Text("Generating...")
                        }
                    } else {
                        Text("Generate System Prompt")
                    }
                }
                .disabled(isGeneratingPrompt)

                Text("Generate a personalized system prompt based on your data and preferences. Start a message with /custom to use it.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if let promptError {
                    Text("Error: \(promptError)")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            Section("Security") {
                if passcodeService.hasPasscode {
                    Button("Change Passcode") {
                        showPasscodeSetup = true
                    }
                    Button("Remove Passcode", role: .destructive) {
                        passcodeService.removePasscode()
                    }
                } else {
                    Button("Set Passcode") {
                        showPasscodeSetup = true
                    }
                }
            }
        }
        .navigationTitle("Settings")
        .sheet(isPresented: $showPasscodeSetup) {
            PasscodeView(mode: .setup)
        }
    }

    // MARK: - Actions

    private func generateSystemPrompt() async {
        isGeneratingPrompt = true
        promptError = nil
        defer { isGeneratingPrompt = false }
        do {
            let prompt = try await chatService.generateSystemPrompt()
            settingsService.updateSettings { $0.customSystemPrompt = prompt }
        } catch {
            promptError = error.localizedDescription
        }
    }

    // MARK: - Bindings

    private var modelBinding: Binding<String> {
        Binding(
            get: { settingsService.settings.model },
            set: { val in settingsService.updateSettings { $0.model = val } }
        )
    }

    private var communicationStyleBinding: Binding<CommunicationStyle> {
        Binding(
            get: { settingsService.settings.communicationStyle },
            set: { val in settingsService.updateSettings { $0.communicationStyle = val } }
        )
    }

    private var languageBinding: Binding<String> {
        Binding(
            get: { settingsService.settings.language },
            set: { val in settingsService.updateSettings { $0.language = val } }
        )
    }

    private var assistantNameBinding: Binding<String> {
        Binding(
            get: { settingsService.settings.assistantName },
            set: { val in settingsService.updateSettings { $0.assistantName = val } }
        )
    }

    private var humanPromptBinding: Binding<Bool> {
        Binding(
            get: { settingsService.settings.humanPrompt },
            set: { val in settingsService.updateSettings { $0.humanPrompt = val } }
        )
    }

    private var keepGoingBinding: Binding<Bool> {
        Binding(
            get: { settingsService.settings.keepGoing },
            set: { val in settingsService.updateSettings { $0.keepGoing = val } }
        )
    }

    private var outsideBoxBinding: Binding<Bool> {
        Binding(
            get: { settingsService.settings.outsideBox },
            set: { val in settingsService.updateSettings { $0.outsideBox = val } }
        )
    }

    private var holisticTherapistBinding: Binding<Bool> {
        Binding(
            get: { settingsService.settings.holisticTherapist },
            set: { val in settingsService.updateSettings { $0.holisticTherapist = val } }
        )
    }

    private var libraryBinding: Binding<Bool> {
        Binding(
            get: { settingsService.settings.libraryIntegrationEnabled },
            set: { val in settingsService.updateSettings { $0.libraryIntegrationEnabled = val } }
        )
    }

    private var calendarBinding: Binding<Bool> {
        Binding(
            get: { settingsService.settings.calendarIntegrationEnabled },
            set: { val in
                settingsService.updateSettings { $0.calendarIntegrationEnabled = val }
                if val {
                    Task {
                        await calendarService.requestAccess()
                        await calendarService.fetchEvents()
                    }
                }
            }
        )
    }

    private var healthBinding: Binding<Bool> {
        Binding(
            get: { healthService.isAuthorized },
            set: { val in
                if val {
                    Task {
                        await healthService.requestAuthorization()
                        await healthService.fetchHealthData()
                    }
                }
            }
        )
    }

    private var personaBinding: Binding<String> {
        Binding(
            get: { settingsService.settings.persona ?? "" },
            set: { val in
                let trimmed = String(val.prefix(1000))
                settingsService.updateSettings { $0.persona = trimmed.isEmpty ? nil : trimmed }
            }
        )
    }
}
