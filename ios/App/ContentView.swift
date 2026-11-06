import SwiftUI
import WidgetKit

struct ContentView: View {
    @State private var input = FlightStore.flightNumber ?? ""
    @State private var info: FlightInfo?
    @State private var message: String?
    @State private var loading = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Flight number") {
                    TextField("AI302 or 6E624", text: $input)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .accessibilityLabel("Flight number")
                    Button(action: { Task { await track() } }) {
                        if loading { ProgressView() } else { Text("Save & Track") }
                    }
                    .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty || loading)
                }

                if let message {
                    Section { Text(message).foregroundStyle(.secondary) }
                }

                if let info {
                    Section(info.flightNumber) {
                        row("Status", info.status.capitalized)
                        if let r = info.route, r.departure.iata != nil || r.arrival.iata != nil {
                            row("Route", "\(r.departure.iata ?? "?") → \(r.arrival.iata ?? "?")")
                        }
                        row("Callsign", info.callsign ?? "—")
                        row("Country", info.aircraft.originCountry ?? "—")
                        if let p = info.position {
                            row("Position", String(format: "%.4f, %.4f", p.latitude, p.longitude))
                        }
                        row("Altitude", info.altitudeMeters.map { "\(Int($0)) m" } ?? "—")
                        row("Speed", info.speedMetersPerSecond.map { "\(Int($0 * 3.6)) km/h" } ?? "—")
                        row("Heading", info.headingDegrees.map { "\(Int($0))°" } ?? "—")
                    }
                    Section {
                        Text("Source: \(info.dataSource). Schedule data is third-party and may be incomplete.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Flight Tracker")
            .task { if !input.isEmpty { await track(save: false) } }
        }
    }

    private func row(_ k: String, _ v: String) -> some View {
        LabeledContent(k, value: v)
    }

    private func track(save: Bool = true) async {
        let fn = input.replacingOccurrences(of: " ", with: "").uppercased()
        guard !fn.isEmpty else { return }
        loading = true; message = nil; info = nil
        defer { loading = false }
        if save { FlightStore.flightNumber = fn }
        do {
            info = try await FlightAPI.fetch(fn)
        } catch {
            message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        // Request a widget refresh; iOS decides when it actually happens.
        WidgetCenter.shared.reloadAllTimelines()
    }
}
