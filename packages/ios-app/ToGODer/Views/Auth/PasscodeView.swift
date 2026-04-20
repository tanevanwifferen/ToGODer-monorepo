import SwiftUI

struct PasscodeView: View {
    enum Mode {
        case unlock
        case setup
    }

    let mode: Mode
    var onUnlocked: (() -> Void)?

    @EnvironmentObject var passcodeService: PasscodeService
    @Environment(\.dismiss) private var dismiss

    @State private var enteredCode = ""
    @State private var confirmCode = ""
    @State private var isConfirming = false
    @State private var errorMessage: String?
    @State private var shakeOffset: CGFloat = 0

    private let codeLength = 4

    var body: some View {
        VStack(spacing: 40) {
            Spacer()

            Text(titleText)
                .font(.title2)
                .fontWeight(.semibold)

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .transition(.opacity)
            }

            dotsView
                .offset(x: shakeOffset)

            keypadView

            Spacer()
        }
        .padding()
        .interactiveDismissDisabled(mode == .unlock)
    }

    // MARK: - Subviews

    private var titleText: String {
        switch mode {
        case .unlock:
            return "Enter Passcode"
        case .setup:
            return isConfirming ? "Confirm Passcode" : "Set Passcode"
        }
    }

    private var currentCode: String {
        isConfirming ? confirmCode : enteredCode
    }

    private var dotsView: some View {
        HStack(spacing: 20) {
            ForEach(0..<codeLength, id: \.self) { index in
                Circle()
                    .fill(index < currentCode.count ? Color.primary : Color.clear)
                    .overlay(
                        Circle().stroke(Color.primary, lineWidth: 2)
                    )
                    .frame(width: 20, height: 20)
            }
        }
    }

    private var keypadView: some View {
        VStack(spacing: 16) {
            ForEach(0..<3) { row in
                HStack(spacing: 32) {
                    ForEach(1...3, id: \.self) { col in
                        let digit = row * 3 + col
                        digitButton(String(digit))
                    }
                }
            }
            HStack(spacing: 32) {
                Color.clear.frame(width: 72, height: 72)
                digitButton("0")
                deleteButton
            }
        }
    }

    private func digitButton(_ digit: String) -> some View {
        Button {
            appendDigit(digit)
        } label: {
            Text(digit)
                .font(.title)
                .fontWeight(.medium)
                .frame(width: 72, height: 72)
                .background(Color(.systemGray5))
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
    }

    private var deleteButton: some View {
        Button {
            deleteLastDigit()
        } label: {
            Image(systemName: "delete.left")
                .font(.title2)
                .frame(width: 72, height: 72)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Logic

    private func appendDigit(_ digit: String) {
        guard currentCode.count < codeLength else { return }

        if isConfirming {
            confirmCode.append(digit)
        } else {
            enteredCode.append(digit)
        }

        if currentCode.count == codeLength {
            handleCodeComplete()
        }
    }

    private func deleteLastDigit() {
        if isConfirming {
            guard !confirmCode.isEmpty else { return }
            confirmCode.removeLast()
        } else {
            guard !enteredCode.isEmpty else { return }
            enteredCode.removeLast()
        }
        errorMessage = nil
    }

    private func handleCodeComplete() {
        switch mode {
        case .unlock:
            if passcodeService.unlock(code: enteredCode) {
                onUnlocked?()
            } else {
                showError("Wrong passcode")
                enteredCode = ""
            }
        case .setup:
            if isConfirming {
                if confirmCode == enteredCode {
                    passcodeService.setPasscode(enteredCode)
                    dismiss()
                } else {
                    showError("Passcodes don't match")
                    confirmCode = ""
                    isConfirming = false
                    enteredCode = ""
                }
            } else {
                withAnimation {
                    isConfirming = true
                }
            }
        }
    }

    private func showError(_ message: String) {
        withAnimation {
            errorMessage = message
        }
        withAnimation(.default.repeatCount(3, autoreverses: true).speed(6)) {
            shakeOffset = 10
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            shakeOffset = 0
        }
    }
}
