import SwiftUI

struct AccountView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var appState: AppState
    @State private var showChangePassword = false
    @State private var oldPassword = ""
    @State private var newPassword = ""
    @State private var confirmNewPassword = ""
    @State private var passwordChanged = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            Section("Account") {
                if let email = authService.email {
                    HStack {
                        Text("Email")
                        Spacer()
                        Text(email)
                            .foregroundStyle(.secondary)
                    }
                }

                HStack {
                    Text("Credits")
                    Spacer()
                    Text(String(format: "%.2f", appState.balanceService.credits))
                        .foregroundStyle(.secondary)
                }

                if let sub = appState.balanceService.subscription, sub.active {
                    HStack {
                        Text("Subscription")
                        Spacer()
                        Text(sub.plan ?? "Active")
                            .foregroundStyle(.green)
                    }
                }
            }

            Section("Security") {
                Button("Change Password") {
                    showChangePassword = true
                }
            }

            Section {
                Button("Sign Out", role: .destructive) {
                    authService.signOut()
                    dismiss()
                }
            }
        }
        .navigationTitle("Account")
        .sheet(isPresented: $showChangePassword) {
            changePasswordSheet
        }
        .task {
            await appState.balanceService.fetchBalance()
        }
    }

    private var changePasswordSheet: some View {
        NavigationStack {
            Form {
                SecureField("Current Password", text: $oldPassword)
                SecureField("New Password", text: $newPassword)
                SecureField("Confirm New Password", text: $confirmNewPassword)

                if let error = authService.error {
                    Text(error).foregroundStyle(.red).font(.caption)
                }

                if passwordChanged {
                    Text("Password changed successfully!").foregroundStyle(.green).font(.caption)
                }
            }
            .navigationTitle("Change Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showChangePassword = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            let success = await authService.changePassword(
                                oldPassword: oldPassword,
                                newPassword: newPassword
                            )
                            if success {
                                passwordChanged = true
                            }
                        }
                    }
                    .disabled(newPassword.count < 8 || newPassword != confirmNewPassword)
                }
            }
        }
    }
}
