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

    func post<T: Decodable>(url: URL, body: some Encodable) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await execute(request)
    }

    func delete(_ path: String) async throws {
        let request = try buildRequest(path: path, method: "DELETE")
        let (_, response) = try await session.data(for: request)
        try validateResponse(response)
    }

    // MARK: - Streaming

    func stream(_ path: String, body: some Encodable) -> AsyncThrowingStream<SSEEvent, Error> {
        // Prepare the request synchronously so init errors are surfaced via the stream.
        let preparedRequest: Result<URLRequest, Error>
        do {
            var request = try buildRequest(path: path, method: "POST")
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            // SSE streams can idle for long stretches before the first chunk
            // (slow LLM TTFT, memory lookups, tool calls). The session-level
            // 60s inter-byte timeout is too aggressive for chat streaming.
            request.timeoutInterval = 300
            preparedRequest = .success(request)
        } catch {
            preparedRequest = .failure(error)
        }

        return AsyncThrowingStream { continuation in
            switch preparedRequest {
            case .failure(let err):
                continuation.finish(throwing: err)
                return
            case .success(let request):
                // A URLSessionDataDelegate receives bytes as they arrive — more
                // reliable than URLSession.bytes(for:).lines, which has been observed
                // to complete with zero yielded lines on some configurations.
                let controller = SSEStreamController(continuation: continuation)
                let config = URLSessionConfiguration.ephemeral
                config.timeoutIntervalForRequest = 300
                config.timeoutIntervalForResource = 600
                config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
                let streamingSession = URLSession(
                    configuration: config,
                    delegate: controller,
                    delegateQueue: nil
                )
                let task = streamingSession.dataTask(with: request)
                controller.task = task
                controller.sessionToInvalidate = streamingSession
                continuation.onTermination = { @Sendable _ in
                    task.cancel()
                    streamingSession.finishTasksAndInvalidate()
                }
                task.resume()
            }
        }
    }

    // MARK: - Private

    private func buildRequest(path: String, method: String) throws -> URLRequest {
        let relativePath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        guard let url = URL(string: relativePath, relativeTo: baseURL) else {
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
    case toolStatus(ToolStatusData)
    case toolResult(ToolResultData)
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
            // Backend sends {"delta":"text"} for chunks
            if let parsed = try? JSONDecoder().decode(SSEChunkData.self, from: Data(d.utf8)) {
                return .chunk(parsed.delta)
            }
            // Fallback: try legacy {"data":"text"} format
            if let parsed = try? JSONDecoder().decode(SSEStringField.self, from: Data(d.utf8)) {
                return .chunk(parsed.data)
            }
            return .chunk(d)
        case "signature":
            guard let d = data else { return nil }
            // Backend sends {"signature":"sig"}
            if let parsed = try? JSONDecoder().decode(SSESignatureData.self, from: Data(d.utf8)) {
                return .signature(parsed.signature)
            }
            // Fallback: try legacy {"data":"sig"} format
            if let parsed = try? JSONDecoder().decode(SSEStringField.self, from: Data(d.utf8)) {
                return .signature(parsed.data)
            }
            return .signature(d)
        case "memory_request":
            guard let d = data else { return nil }
            // Backend sends {"keys":["key1","key2"]} directly
            if let parsed = try? JSONDecoder().decode(SSEMemoryRequestData.self, from: Data(d.utf8)) {
                return .memoryRequest(parsed.keys)
            }
            return nil
        case "tool_call":
            guard let d = data else { return nil }
            // Backend sends tool call data directly (not wrapped in "data" field)
            if let parsed = try? JSONDecoder().decode(ToolCallData.self, from: Data(d.utf8)) {
                return .toolCall(parsed)
            }
            return nil
        case "tool_status":
            guard let d = data,
                  let parsed = try? JSONDecoder().decode(ToolStatusData.self, from: Data(d.utf8)) else { return nil }
            return .toolStatus(parsed)
        case "tool_result":
            guard let d = data,
                  let parsed = try? JSONDecoder().decode(ToolResultData.self, from: Data(d.utf8)) else { return nil }
            return .toolResult(parsed)
        case "error":
            if let d = data,
               let parsed = try? JSONDecoder().decode(SSEErrorData.self, from: Data(d.utf8)) {
                return .error(parsed.message)
            }
            return .error(data ?? "Unknown error")
        case "done":
            return .done
        default:
            return nil
        }
    }
}

/// Backend chunk format: {"delta":"text"}
private struct SSEChunkData: Codable {
    let delta: String
}

/// Backend signature format: {"signature":"sig"}
private struct SSESignatureData: Codable {
    let signature: String
}

/// Backend error format: {"message":"error text"}
private struct SSEErrorData: Codable {
    let message: String
}

/// Legacy/fallback format: {"data":"text"}
private struct SSEStringField: Codable {
    let data: String
}

/// Backend memory request format: {"keys":["a","b"]}
private struct SSEMemoryRequestData: Codable {
    let keys: [String]
}

struct ToolCallData: Codable {
    let id: String?
    let name: String
    let arguments: [String: ToolArgumentValue]?

    /// Convenience accessor: string value for an argument key.
    func string(_ key: String) -> String? {
        arguments?[key]?.stringValue
    }

    /// Convenience accessor: integer value for an argument key.
    func int(_ key: String) -> Int? {
        arguments?[key]?.intValue
    }

    /// JSON-encodes the raw arguments, matching RN's
    /// `JSON.stringify(toolCall.arguments ?? {})` for the tool_calls record.
    func argumentsJSON() -> String {
        guard let arguments,
              let data = try? JSONEncoder().encode(arguments),
              let json = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return json
    }
}

/// Tool arguments arrive as arbitrary JSON values (e.g. `depth` is a number,
/// `path` is a string). Decodes any scalar/array/object without loss.
enum ToolArgumentValue: Codable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([ToolArgumentValue])
    case object([String: ToolArgumentValue])

    var stringValue: String? {
        if case .string(let s) = self { return s }
        return nil
    }

    var intValue: Int? {
        switch self {
        case .number(let n): return Int(n)
        case .string(let s): return Int(s)
        default: return nil
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let b = try? container.decode(Bool.self) {
            self = .bool(b)
        } else if let n = try? container.decode(Double.self) {
            self = .number(n)
        } else if let s = try? container.decode(String.self) {
            self = .string(s)
        } else if let a = try? container.decode([ToolArgumentValue].self) {
            self = .array(a)
        } else if let o = try? container.decode([String: ToolArgumentValue].self) {
            self = .object(o)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported tool argument value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let s): try container.encode(s)
        case .number(let n):
            if n == n.rounded(), abs(n) < 1e15 {
                try container.encode(Int64(n))
            } else {
                try container.encode(n)
            }
        case .bool(let b): try container.encode(b)
        case .null: try container.encodeNil()
        case .array(let a): try container.encode(a)
        case .object(let o): try container.encode(o)
        }
    }
}

/// Tool activity status emitted by the backend so the UI can show what the
/// AI is currently doing. Wire-compatible with RN `ToolStatusEvent`.
struct ToolStatusData: Codable {
    let id: String
    let name: String
    let status: String // "generating" | "running" | "done"
    let isError: Bool?
}

/// Backend-executed tool result. Wire-compatible with RN `ToolResultEvent`.
struct ToolResultData: Codable {
    let toolCallId: String
    let name: String
    let result: String
    let isError: Bool

    enum CodingKeys: String, CodingKey {
        case toolCallId = "tool_call_id"
        case name, result
        case isError = "is_error"
    }
}

// MARK: - Streaming Delegate

/// Receives SSE bytes incrementally via URLSessionDataDelegate and yields parsed
/// events through an AsyncThrowingStream continuation.
private final class SSEStreamController: NSObject, URLSessionDataDelegate {
    private let continuation: AsyncThrowingStream<SSEEvent, Error>.Continuation
    private var buffer = Data()
    private var didFinish = false

    weak var task: URLSessionDataTask?
    var sessionToInvalidate: URLSession?

    init(continuation: AsyncThrowingStream<SSEEvent, Error>.Continuation) {
        self.continuation = continuation
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        guard let http = response as? HTTPURLResponse else {
            finish(throwing: APIError.invalidResponse)
            completionHandler(.cancel)
            return
        }
        print("[APIClient.stream] status=\(http.statusCode) content-type=\(http.value(forHTTPHeaderField: "Content-Type") ?? "nil") content-encoding=\(http.value(forHTTPHeaderField: "Content-Encoding") ?? "nil")")
        if !(200...299).contains(http.statusCode) {
            if http.statusCode == 429 {
                let retryAfter = http.value(forHTTPHeaderField: "retry-after")
                    .flatMap { TimeInterval($0) }
                finish(throwing: APIError.rateLimited(retryAfter: retryAfter))
            } else {
                finish(throwing: APIError.httpError(statusCode: http.statusCode, body: nil))
            }
            completionHandler(.cancel)
            return
        }
        completionHandler(.allow)
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive data: Data
    ) {
        buffer.append(data)
        drainCompleteFrames()
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        // Drain anything left in the buffer in case the final frame has no
        // trailing blank line.
        drainCompleteFrames()
        if let error = error {
            finish(throwing: APIError.networkError(error))
        } else {
            finish(throwing: nil)
        }
    }

    private func drainCompleteFrames() {
        // SSE frames are separated by a blank line ("\n\n" or "\r\n\r\n").
        // Scan the buffer for frame boundaries and parse each complete frame.
        while let boundary = findFrameBoundary(in: buffer) {
            // `boundary` offsets are relative to buffer.startIndex, so prefix/
            // removeFirst operate correctly even after prior removals have
            // shifted the buffer's startIndex off zero.
            let frameData = Data(buffer.prefix(boundary.frameLength))
            buffer.removeFirst(boundary.consumedLength)

            guard let frameString = String(data: frameData, encoding: .utf8) else {
                continue
            }
            let trimmed = frameString.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }
            // Skip pure-comment frames (keep-alive, padding)
            if trimmed.allSatisfy({ $0 == ":" }) == false,
               let event = SSEEvent.parse(frameString) {
                print("[APIClient.stream] yielding event: \(event)")
                continuation.yield(event)
                if case .done = event {
                    finish(throwing: nil)
                    task?.cancel()
                    return
                }
            }
        }
    }

    /// Locate the end of the next SSE frame in the buffer.
    /// Returns offsets RELATIVE to `data.startIndex`:
    /// - `frameLength`: number of bytes from startIndex up to the blank-line delimiter
    /// - `consumedLength`: number of bytes to remove from the front (frame + delimiter)
    private func findFrameBoundary(in data: Data) -> (frameLength: Int, consumedLength: Int)? {
        // Match either "\n\n" or "\r\n\r\n".
        let lfLf = Data([0x0A, 0x0A])
        let crLfCrLf = Data([0x0D, 0x0A, 0x0D, 0x0A])
        if let range = data.range(of: crLfCrLf) {
            let frameLength = data.distance(from: data.startIndex, to: range.lowerBound)
            let consumed = data.distance(from: data.startIndex, to: range.upperBound)
            return (frameLength, consumed)
        }
        if let range = data.range(of: lfLf) {
            let frameLength = data.distance(from: data.startIndex, to: range.lowerBound)
            let consumed = data.distance(from: data.startIndex, to: range.upperBound)
            return (frameLength, consumed)
        }
        return nil
    }

    private func finish(throwing error: Error?) {
        if didFinish { return }
        didFinish = true
        if let error = error {
            continuation.finish(throwing: error)
        } else {
            continuation.finish()
        }
        sessionToInvalidate?.finishTasksAndInvalidate()
        sessionToInvalidate = nil
    }
}
