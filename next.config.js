/** @type {import('next').NextConfig} */
const LIVE_APP = 'https://helm.earthbreeze.com';

const nextConfig = {
  reactStrictMode: true,
  // Produces .next/standalone - required for Cloud Run / Docker deployments.
  output: 'standalone',
  // Helm now runs on Google Cloud. The old Vercel copy still points at the
  // frozen Supabase database, so on Vercel every request (pages, form links,
  // callbacks) is sent on to the live app, keeping its path and query.
  async redirects() {
    if (!process.env.VERCEL) return [];
    // The RFP portal page is the exception: vendors' access tokens are saved in
    // this site's browser storage, so the page itself hands them to the new
    // address (public/rfp/index.html) rather than losing them in a redirect.
    return [
      { source: '/', destination: `${LIVE_APP}/`, permanent: false },
      { source: '/:path((?!rfp(?:/index\\.html)?/?$).+)', destination: `${LIVE_APP}/:path`, permanent: false },
    ];
  },
};
module.exports = nextConfig;
