/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The project lives on a shared volume where Turbopack's persistent cache
    // cannot fsync; keep the cache in memory instead.
    turbopackFileSystemCacheForBuild: false,
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
