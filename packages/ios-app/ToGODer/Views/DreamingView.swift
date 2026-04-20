import SwiftUI

struct DreamingView: View {
    @State private var pulse = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.85).ignoresSafeArea()

            VStack(spacing: 24) {
                Image(systemName: "moon.stars.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.white)
                    .scaleEffect(pulse ? 1.1 : 0.9)
                    .opacity(pulse ? 1.0 : 0.7)
                    .animation(
                        .easeInOut(duration: 1.4).repeatForever(autoreverses: true),
                        value: pulse
                    )

                Text("Dreaming…")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.white)

                Text("Processing memories")
                    .font(.callout)
                    .foregroundStyle(.white.opacity(0.7))

                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white)
                    .padding(.top, 8)
            }
        }
        .onAppear { pulse = true }
        .transition(.opacity)
    }
}
