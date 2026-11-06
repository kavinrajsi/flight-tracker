import Foundation

// Add this file to BOTH the app target and the widget extension target.

enum AppConfig {
    /// Replace with your deployed Vercel URL.
    static let apiBaseURL = URL(string: "https://YOUR-PROJECT.vercel.app")!
    /// Must match the App Group capability on both targets.
    static let appGroup = "group.com.example.flighttracker"
    static let flightKey = "selectedFlightNumber"
}

struct FlightInfo: Codable, Equatable {
    struct Aircraft: Codable, Equatable { let icao24: String?; let originCountry: String? }
    struct Position: Codable, Equatable { let latitude: Double; let longitude: Double }

    struct Airport: Codable, Equatable { let iata: String? }
    struct Route: Codable, Equatable { let departure: Airport; let arrival: Airport }

    let flightNumber: String
    let callsign: String?
    let route: Route?
    let status: String
    let aircraft: Aircraft
    let position: Position?
    let altitudeMeters: Double?
    let speedMetersPerSecond: Double?
    let headingDegrees: Double?
    let lastContact: String?
    let dataSource: String
}

enum FlightError: LocalizedError {
    case notFound(String)
    case server(String)
    case network

    var errorDescription: String? {
        switch self {
        case .notFound: return "Not currently found in tracking data"
        case .server(let m): return m
        case .network: return "Network unavailable"
        }
    }
}

enum FlightStore {
    private static var defaults: UserDefaults? { UserDefaults(suiteName: AppConfig.appGroup) }
    static var flightNumber: String? {
        get { defaults?.string(forKey: AppConfig.flightKey) }
        set { defaults?.set(newValue, forKey: AppConfig.flightKey) }
    }
}

enum FlightAPI {
    private struct ErrorBody: Decodable { let error: String? }

    static func fetch(_ flightNumber: String) async throws -> FlightInfo {
        let url = AppConfig.apiBaseURL.appendingPathComponent("api/flight/\(flightNumber)")
        var req = URLRequest(url: url)
        req.timeoutInterval = 15
        let data: Data, resp: URLResponse
        do { (data, resp) = try await URLSession.shared.data(for: req) } catch { throw FlightError.network }
        guard let http = resp as? HTTPURLResponse else { throw FlightError.network }
        if http.statusCode == 200 { return try JSONDecoder().decode(FlightInfo.self, from: data) }
        let msg = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error ?? "Error \(http.statusCode)"
        if http.statusCode == 404 { throw FlightError.notFound(msg) }
        throw FlightError.server(msg)
    }
}
