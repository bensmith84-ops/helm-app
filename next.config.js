/** @type {import('next').NextConfig} */
const CLOUD_RUN_APP = 'https://helm-app-qp7o2dcl5a-uc.a.run.app';

const nextConfig = {
  reactStrictMode: true,
  // Produces .next/standalone - required for Cloud Run / Docker deployments.
  output: 'standalone',
  // Helm now runs on Google Cloud. The old Vercel copy still points at the
  // frozen Supabase database, so on Vercel every request (pages, form links,
  // callbacks) is sent on to the live app, keeping its path and query.
  async redirects() {
    if (!process.env.VERCEL) return [];
    return [{ source: '/:path*', destination: `${CLOUD_RUN_APP}/:path*`, permanent: false }];
  },
};
module.exports = nextConfig;
