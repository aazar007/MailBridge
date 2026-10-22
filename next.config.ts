import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Prisma Composer packages the self-contained folder that only
  // standalone output produces.
  output: 'standalone',
};

export default nextConfig;
