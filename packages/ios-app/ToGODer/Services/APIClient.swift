import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int, body: String?)
    case rateLimited(retryAfter: TimeInterval?)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .invalidResponse: return "Invalid response from server"
        case .httpError(let code, let body): return "HTTP \(code): \(body ?? "Unknown error")"
        case .rateLimited: return "Rate limited. Please try again later."
        case .decodingError(let err): return "Failed to decode response: \(err.localizedDescription)"
        case .networkError(let err): return err.localizedDescription
        }
    }
}

actor APIClient {
    let baseURL: URL
    private var token: String?
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(baseURL: URL) {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: config)
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    func setToken(_ token: String?) {
        self.token = token
    }

    // MARK: - HTTP Methods

    func get<T: Decodable>(_ path: String) async throws -> T {
        let request = try buildRequest(path: path, method: "GET")
        return try await execute(request)
    }

    func post<T: Decodable>(_ path: String, body: some Encodable) async throws -> T {
        var request = try buildRequest(path: path, method: "POST")
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await execute(request)
    }

    func post(_ path: String, body: some Encodable) async throws {
        var request = try buildRequest(path: path, method: "POST")
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (_, response) = try await session.data(for: request)
        try validateResponse(response)
    }

    func delete(_ path: String) async throws {
        let request = try buildRequest(path: path, method: "DELETE")
        let (_, response) = try await session.data(for: request)
        try validateResponse(response)
    }

    // MARK: - Streaming

    func stream(_ path: String, body: some Encodable) -> AsyncThrowingStream<SSEEvent, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    var request = try self.buildRequest(path: path, method: "POST")
                    request.httpBody = try self.encoder.encode(body)
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

                    let (bytes, response) = try await self.session.bytes(for: request)
                    try self.validateResponse(response)

                    var buffer = ""
                    for try await line in bytes.lines {
                        buffer += line + "\n"
                        if line.isEmpty {
                            if let event = SSEEvent.parse(buffer) {
                                continuation.yield(event)
                                if case .done = event {
                                    continuation.finish()
                                    return
                                }
                            }
                            buffer = ""
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Private

    private func buildRequest(path: String, method: String) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let token = token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    private func validateResponse(_ response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        switch httpResponse.statusCode {
        case 200...299:
            return
        case 429:
            let retryAfter = httpResponse.value(forHTTPHeaderField: "retry-after")
                .flatMap { TimeInterval($0) }
            throw APIError.rateLimited(retryAfter: retryAfter)
        default:
            throw APIError.httpError(statusCode: httpResponse.statusCode, body: nil)
        }
    }
}

// MARK: - SSE

enum SSEEvent {
    case chunk(String)
    case signature(String)
    case memoryRequest([String])
    case toolCall(ToolCallData)
    case error(String)
    case done

    static func parse(_ raw: String) -> SSEEvent? {
        var eventType: String?
        var data: String?

        for line in raw.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(line)
            if line.hasPrefix("event:") {
                eventType = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                data = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
            }
        }

        guard let type = eventType else { return nil }

        switch type {
        case "chunk":
            guard let d = data else { return nil }
            if let parsed = try? JSONDecoder().decode(SSEData.self, from: Data(d.utf8)) {
                return .chunk(parsed.data)
            }
            return .chunk(d)
        case "signature":
            guard let d = data else { return nil }
            if let parsed = try? JSONDecoder().decode(SSEData.self, from: Data(d.utf8)) {
                return .signature(parsed.data)
            }
            return .signature(d)
        case "memory_request":
            guard let d = data,
                  let parsed = try? JSONDecoder().decode(SSEMemoryRequest.self, from: Data(d.utf8)) else { return nil }
            return .memoryRequest(parsed.data.keys)
        case "tool_call":
            guard let d = data,
                  let parsed = try? JSONDecoder().decode(SSEToolCall.self, from: Data(d.utf8)) else { return nil }
            return .toolCall(parsed.data)
        case "error":
            return .error(data ?? "Unknown error")
        case "done":
            return .done
        default:
            return nil
        }
    }
}

private struct SSEData: Codable {
    let data: String
}

private struct SSEMemoryRequest: Codable {
    let data: MemoryRequest
}

private struct SSEToolCall: Codable {
    let data: ToolCallData
}

struct ToolCallData: Codable {
    let name: String
    let arguments: [String: String]?
}
