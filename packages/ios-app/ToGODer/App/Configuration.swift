import Foundation

enum Configuration {
    static let apiBaseURL: URL = {
        if let urlString = Bundle.main.infoDictionary?["API_BASE_URL"] as? String,
           let url = URL(string: urlString) {
            return url
        }
        return URL(string: "https://dev.togoder.click/api")!
    }()

    static let shareBaseURL: URL = {
        if let urlString = Bundle.main.infoDictionary?["SHARE_BASE_URL"] as? String,
           let url = URL(string: urlString) {
            return url
        }
        return URL(string: "https://dev.togoder.click/shared")!
    }()

    static let tokenRefreshInterval: TimeInterval = 15 * 60 // 15 minutes
    static let syncDebounceInterval: TimeInterval = 5
    static let maxMemoryLoops = 4
    static let freeMessageLimit = 10
}
