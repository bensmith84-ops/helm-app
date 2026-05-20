/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces .next/standalone — required for Cloud Run / Docker deployments.
  // Vercel ignores this and uses its own build target, so this is safe to add
  // while both Vercel and Cloud Run run in parallel.
  output: 'standalone',
};
module.exports = nextConfig;
