/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O pacote de contratos é TypeScript cru do workspace: o Next precisa
  // compilá-lo junto em vez de esperar um dist pronto.
  transpilePackages: ['@a-ponte/contracts'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
