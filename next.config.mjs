/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  // A production build and a running dev server must not share an output
  // directory: the build rewrites the manifests the dev server is reading and
  // it starts 404-ing its own routes. Deploys leave this unset and get `.next`
  // as usual; `npm run build:check` points it elsewhere so a build can be
  // verified while `npm run dev` keeps serving.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: {
    // The project lives on a shared volume where Turbopack's persistent cache
    // cannot fsync; keep the cache in memory instead.
    turbopackFileSystemCacheForBuild: false,
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
