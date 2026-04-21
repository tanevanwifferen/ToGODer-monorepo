import SwiftUI

struct DonateView: View {
    @EnvironmentObject var settingsService: SettingsService
    @EnvironmentObject var appState: AppState

    var body: some View {
        List {
            Section {
                Text("ToGODer is built with care and provided for free. If you find it helpful, consider supporting its development.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section("Community Balance") {
                HStack {
                    Text("Donated Balance")
                    Spacer()
                    Text(String(format: "$%.2f", appState.balanceService.globalBalance))
                        .fontWeight(.semibold)
                        .foregroundStyle(.tint)
                }
            }

            if let options = settingsService.globalConfig?.donateOptions {
                Section("Donation Options") {
                    ForEach(options) { option in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(option.name)
                                .fontWeight(.medium)

                            if let address = option.address, !address.isEmpty {
                                HStack {
                                    Text(address)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                    Spacer()
                                    Button {
                                        UIPasteboard.general.string = address
                                    } label: {
                                        Image(systemName: "doc.on.doc")
                                            .font(.caption)
                                    }
                                }
                            }

                            if let urlString = option.url, let url = URL(string: urlString) {
                                Link(destination: url) {
                                    Label("Open", systemImage: "arrow.up.right.square")
                                        .font(.caption)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle("Support ToGODer")
        .task {
            await appState.balanceService.fetchBalance()
        }
    }
}
