import WidgetKit
import SwiftUI

struct FlightEntry: TimelineEntry {
    enum Content { case noFlight, info(FlightInfo), unavailable(String, String) } // flight, message
    let date: Date
    let content: Content
}

struct FlightProvider: TimelineProvider {
    func placeholder(in context: Context) -> FlightEntry {
        FlightEntry(date: .now, content: .unavailable("AI302", "Loading…"))
    }

    func getSnapshot(in context: Context, completion: @escaping (FlightEntry) -> Void) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FlightEntry>) -> Void) {
        Task {
            let entry: FlightEntry
            if let fn = FlightStore.flightNumber, !fn.isEmpty {
                do { entry = FlightEntry(date: .now, content: .info(try await FlightAPI.fetch(fn))) }
                catch { entry = FlightEntry(date: .now, content: .unavailable(fn, (error as? LocalizedError)?.errorDescription ?? "Unavailable")) }
            } else {
                entry = FlightEntry(date: .now, content: .noFlight)
            }
            // Ask for a refresh in ~15 min; iOS may defer this.
            completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(15 * 60))))
        }
    }
}

struct FlightWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FlightEntry

    var body: some View {
        switch entry.content {
        case .noFlight:
            message(title: "No flight selected", detail: "Open the app to choose one.")
        case .unavailable(let fn, let msg):
            message(title: fn, detail: msg)
        case .info(let i):
            if family == .systemSmall { small(i) } else { medium(i) }
        }
    }

    private func message(title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.headline)
            Text(detail).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func small(_ i: FlightInfo) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(i.flightNumber).font(.title2.bold())
            Text(i.status.capitalized).font(.caption.bold())
                .foregroundStyle(i.status == "airborne" ? .green : .orange)
            Spacer()
            Text(i.altitudeMeters.map { "\(Int($0)) m" } ?? "—").font(.subheadline)
            Text(i.speedMetersPerSecond.map { "\(Int($0 * 3.6)) km/h" } ?? "—").font(.subheadline)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func medium(_ i: FlightInfo) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(i.flightNumber).font(.title.bold())
                Text(i.status.capitalized).font(.caption.bold())
                    .foregroundStyle(i.status == "airborne" ? .green : .orange)
                Text(i.callsign).font(.caption).foregroundStyle(.secondary)
                Spacer()
                Text("OpenSky · not airline status").font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                metric("Altitude", i.altitudeMeters.map { "\(Int($0)) m" })
                metric("Speed", i.speedMetersPerSecond.map { "\(Int($0 * 3.6)) km/h" })
                metric("Heading", i.headingDegrees.map { "\(Int($0))°" })
            }
        }
    }

    private func metric(_ k: String, _ v: String?) -> some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text(k).font(.caption2).foregroundStyle(.secondary)
            Text(v ?? "—").font(.subheadline.bold())
        }
    }
}

struct FlightWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "FlightWidget", provider: FlightProvider()) { entry in
            FlightWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Flight Status")
        .description("Latest aircraft tracking data for your selected flight.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct FlightWidgetBundle: WidgetBundle {
    var body: some Widget { FlightWidget() }
}
