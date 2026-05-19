/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tree-shake icon libraries (lucide-react ships 1500+ icons; without this,
  // we bundle ones we don't use). Same trick for date-fns + recharts.
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "recharts"],
  },
};

export default nextConfig;
