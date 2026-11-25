import Foundation

enum AppConfig {
    // The web's host name from the build (KOSKOVI_HOST), e.g. sal.example.cz.
    static let baseURL: URL = {
        let host = (Bundle.main.object(forInfoDictionaryKey: "KoskoviHost") as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return URL(string: "https://\(host.isEmpty ? "localhost" : host)")!
    }()

    static func webURL(_ path: String) -> URL {
        URL(string: path, relativeTo: baseURL)?.absoluteURL ?? baseURL
    }
}

enum APIError: LocalizedError {
    static let outdatedServer = "Web sálu ještě běží ve starší verzi, která tohle neumí. Jakmile se nasadí nová verze, bude to fungovat."

    case server(String)
    case network
    case decoding

    var errorDescription: String? {
        switch self {
        case .server(let message): return message
        case .network: return "Nepodařilo se spojit se serverem. Zkontroluj připojení."
        case .decoding: return "Server odpověděl nečekaně. Zkus aplikaci aktualizovat."
        }
    }
}

// The web's own API. The login is the web's session cookie, kept by
// URLSession's shared cookie storage between launches.
enum API {
    private struct Message: Decodable { let message: String? }

    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        configuration.httpCookieStorage = .shared
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 20
        return URLSession(configuration: configuration)
    }()

    static func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        try await request("GET", path, body: nil, as: type)
    }

    static func send<T: Decodable>(
        _ method: String,
        _ path: String,
        body: [String: Any]? = nil,
        as type: T.Type = T.self
    ) async throws -> T {
        try await request(method, path, body: body, as: type)
    }

    // A path segment such as a trainer's name ("Šárka" → "%C5%A0%C3%A1rka").
    static func segment(_ value: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    private static func request<T: Decodable>(
        _ method: String,
        _ path: String,
        body: [String: Any]?,
        as type: T.Type
    ) async throws -> T {
        var request = URLRequest(url: AppConfig.webURL(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.network
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode(Message.self, from: data))?.message
            // A 404 page instead of the API's own answer: the web does not
            // have this part yet.
            if status == 404 && message == nil {
                throw APIError.server(APIError.outdatedServer)
            }
            throw APIError.server(message ?? defaultMessage(for: status))
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decoding
        }
    }

    private static func defaultMessage(for status: Int) -> String {
        switch status {
        case 401: return "Přihlas se prosím."
        case 403: return "K tomu nemáš oprávnění."
        case 404: return "Nenalezeno."
        case 429: return "Příliš mnoho pokusů, zkus to za chvíli."
        default: return "Něco se nepovedlo (chyba \(status))."
        }
    }
}

// For responses whose content does not matter.
struct Empty: Decodable {}

struct MessageResponse: Decodable {
    let message: String?
}

// What PUT /api/account/profile answers; an older web leaves out the
// schedule name, so the app can tell it was not saved.
struct ProfileSaveResponse: Decodable {
    struct Profile: Decodable {
        let scheduleName: String?
    }

    let message: String?
    let profile: Profile?

    func check(scheduleName: String) throws {
        // The web collapses spaces, so compare the same way.
        let collapse = { (value: String) in value.split(whereSeparator: \.isWhitespace).joined(separator: " ") }
        if collapse(profile?.scheduleName ?? "") != collapse(scheduleName) {
            throw APIError.server(APIError.outdatedServer)
        }
    }
}
