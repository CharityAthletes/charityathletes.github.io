import Foundation
import Supabase

// Simple UserDefaults-backed auth storage (safe for simulator)
struct UserDefaultsLocalStorage: AuthLocalStorage {
    func store(key: String, value: Data) throws {
        UserDefaults.standard.set(value, forKey: key)
    }
    func retrieve(key: String) throws -> Data? {
        UserDefaults.standard.data(forKey: key)
    }
    func remove(key: String) throws {
        UserDefaults.standard.removeObject(forKey: key)
    }
}

/// Single shared Supabase client for the iOS app.
let supabase: SupabaseClient = {
    let url = URL(string: "https://pnypejauufyriqtvpqev.supabase.co")!
    let key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBueXBlamF1dWZ5cmlxdHZwcWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODIyMTMsImV4cCI6MjA5MDg1ODIxM30.nyrOzO4NNeZeLtDk79Gk-5wilbKhKbVmHRl7wSjeq8Y"
    let options = SupabaseClientOptions(
        auth: .init(
            storage: UserDefaultsLocalStorage(),
            emitLocalSessionAsInitialSession: true
        )
    )
    return SupabaseClient(supabaseURL: url, supabaseKey: key, options: options)
}()

/// Build-time config resolved from Info.plist (populated by Config.xcconfig).
enum AppConfig {
  static var supabaseURL: String {
    Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String ?? ""
  }
  static var supabaseAnonKey: String {
    Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String ?? ""
  }
  static var backendURL: String {
    let raw = Bundle.main.object(forInfoDictionaryKey: "BACKEND_URL") as? String ?? ""
    // xcconfig strips "//" (treats it as a comment), so fall back if the value looks broken
    guard raw.hasPrefix("http://") || raw.hasPrefix("https://") else {
      return "https://charityathletes-production.up.railway.app"
    }
    return raw
  }
}
