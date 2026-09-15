/** @type {import('next').NextConfig} */
const nextConfig = {
  // The collector's package-lock.json one directory up otherwise
  // makes Next.js guess at the workspace root. This is a standalone
  // project (see DASHBOARD_PROMPT.md — separate dependency trees),
  // so pin it explicitly to this directory.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
