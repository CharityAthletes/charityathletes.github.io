import UIKit

extension UIImage {
    /// Returns JPEG data compressed to fit within `maxBytes`.
    /// Starts at quality 0.85 and steps down until small enough or hits 0.2.
    func jpegCompressed(maxBytes: Int) -> Data {
        // Resize first if the image is very large (>2048px on longest edge)
        let resized = resizedIfNeeded(maxDimension: 2048)
        var quality: CGFloat = 0.85
        while quality >= 0.2 {
            if let data = resized.jpegData(compressionQuality: quality), data.count <= maxBytes {
                return data
            }
            quality -= 0.15
        }
        // Fallback — return at lowest quality
        return resized.jpegData(compressionQuality: 0.2) ?? Data()
    }

    private func resizedIfNeeded(maxDimension: CGFloat) -> UIImage {
        let longest = max(size.width, size.height)
        guard longest > maxDimension else { return self }
        let scale  = maxDimension / longest
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in draw(in: CGRect(origin: .zero, size: newSize)) }
    }
}
