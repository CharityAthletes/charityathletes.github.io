import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'pnypejauufyriqtvpqev.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'dgalywqvuagkplaopcle.supabase.co' },
    ],
  },
}

export default nextConfig
