import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['chem.kapy.ca'],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
