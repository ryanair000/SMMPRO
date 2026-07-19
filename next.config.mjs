/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/post',
        destination: '/api/post-v2',
      },
    ];
  },
};

export default nextConfig;
