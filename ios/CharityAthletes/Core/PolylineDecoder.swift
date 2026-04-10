import CoreLocation

/// Decodes a Google-encoded polyline string (used by Strava) into coordinates.
enum PolylineDecoder {
    static func decode(_ encoded: String) -> [CLLocationCoordinate2D] {
        var coordinates: [CLLocationCoordinate2D] = []
        let utf8 = encoded.utf8
        var index = utf8.startIndex
        var lat = 0
        var lng = 0

        while index < utf8.endIndex {
            // Decode one varint for latitude delta
            var result = 0, shift = 0, byte: Int
            repeat {
                guard index < utf8.endIndex else { return coordinates }
                byte = Int(utf8[index]) - 63
                utf8.formIndex(after: &index)
                result |= (byte & 0x1f) << shift
                shift += 5
            } while byte >= 0x20
            lat += (result & 1) != 0 ? ~(result >> 1) : result >> 1

            // Decode one varint for longitude delta
            result = 0; shift = 0
            repeat {
                guard index < utf8.endIndex else { return coordinates }
                byte = Int(utf8[index]) - 63
                utf8.formIndex(after: &index)
                result |= (byte & 0x1f) << shift
                shift += 5
            } while byte >= 0x20
            lng += (result & 1) != 0 ? ~(result >> 1) : result >> 1

            coordinates.append(CLLocationCoordinate2D(
                latitude:  Double(lat) / 1e5,
                longitude: Double(lng) / 1e5
            ))
        }
        return coordinates
    }
}
