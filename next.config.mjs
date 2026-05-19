/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tree-shake icon libraries (lucide-react ships 1500+ icons; without this,
  // we bundle ones we don't use). Same trick for date-fns + recharts.
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "recharts"],
    // Server Actions: Next's default cap is 1MB. Uploads can hit ~10MB.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
