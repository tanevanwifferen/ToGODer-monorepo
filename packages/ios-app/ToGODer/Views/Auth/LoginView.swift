import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authService: AuthService
    @State private var mode: AuthMode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var showSuccess = false
    @Environment(\.dismiss) private var dismiss

    enum AuthMode {
        case signIn, signUp, forgotPassword
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                Image(systemName: mode == .forgotPassword ? "key" : "person.circle")
                    .font(.system(size: 60))
                    .foregroundStyle(.blue)
                    .padding(.top, 40)

                Text(headerTitle)
                    .font(.title2)
                    .fontWeight(.bold)

                // Form
                VStack(spacing: 16) {
                    TextField("Email", text: $email)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .autocapitalization(.none)

                    if mode != .forgotPassword {
                        SecureField("Password", text: $password)
                            .textFieldStyle(.roundedBorder)
                            .textContentType(mode == .signUp ? .newPassword : .password)
                    }

                    if mode == .signUp {
                        SecureField("Confirm Password", text: $confirmPassword)
                            .textFieldStyle(.roundedBorder)
                            .textContentType(.newPassword)
                    }
                }
                .padding(.horizontal, 24)

                // Error
                if let error = authService.error {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 24)
                }

                // Success
                if showSuccess {
                    Text(successMessage)
                        .font(.caption)
                        .foregroundStyle(.green)
                        .padding(.horizontal, 24)
                }

                // Primary Action
                Button {
                    Task { await performAction() }
                } label: {
                    if authService.isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text(actionTitle)
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding(.horizontal, 24)
                .disabled(!isFormValid || authService.isLoading)

                // Mode Switches
                VStack(spacing: 12) {
                    if mode == .signIn {
                        Button("Create an account") {
                            withAnimation { mode = .signUp }
                        }
                        Button("Forgot password?") {
                            withAnimation { mode = .forgotPassword }
                        }
                    } else {
                        Button("Back to Sign In") {
                            withAnimation { mode = .signIn }
                        }
                    }
                }
                .font(.subheadline)
            }
        }
        .navigationTitle(headerTitle)
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: authService.isAuthenticated) { _, isAuth in
            if isAuth { dismiss() }
        }
    }

    private var headerTitle: String {
        switch mode {
        case .signIn: return "Sign In"
        case .signUp: return "Create Account"
        case .forgotPassword: return "Reset Password"
        }
    }

    private var actionTitle: String {
        switch mode {
        case .signIn: return "Sign In"
        case .signUp: return "Create Account"
        case .forgotPassword: return "Send Reset Email"
        }
    }

    private var successMessage: String {
        switch mode {
        case .signUp: return "Account created! Check your email to verify."
        case .forgotPassword: return "Reset email sent! Check your inbox."
        default: return ""
        }
    }

    private var isFormValid: Bool {
        switch mode {
        case .signIn:
            return !email.isEmpty && !password.isEmpty
        case .signUp:
            return !email.isEmpty && password.count >= 8 && password == confirmPassword
        case .forgotPassword:
            return !email.isEmpty
        }
    }

    private func performAction() async {
        showSuccess = false
        switch mode {
        case .signIn:
            await authService.signIn(email: email, password: password)
        case .signUp:
            await authService.signUp(email: email, password: password)
            if authService.error == nil {
                showSuccess = true
            }
        case .forgotPassword:
            await authService.forgotPassword(email: email)
            if authService.error == nil {
                showSuccess = true
            }
        }
    }
}
