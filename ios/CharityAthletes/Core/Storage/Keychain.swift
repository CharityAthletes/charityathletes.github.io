import Security
import Foundation

enum KeychainKey: String {
    case accessToken = "ca.access_token"
    case userId      = "ca.user_id"
}

enum Keychain {
    static func set(_ key: KeychainKey, _ value: String) {
        let data = Data(value.utf8)
        let q: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
            kSecValueData as String:   data,
        ]
        SecItemDelete(q as CFDictionary)
        SecItemAdd(q as CFDictionary, nil)
    }

    static func get(_ key: KeychainKey) -> String? {
        let q: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
            kSecReturnData as String:  true,
            kSecMatchLimit as String:  kSecMatchLimitOne,
        ]
        var ref: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &ref) == errSecSuccess,
              let data = ref as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: KeychainKey) {
        let q: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String: key.rawValue,
        ]
        SecItemDelete(q as CFDictionary)
    }
}
