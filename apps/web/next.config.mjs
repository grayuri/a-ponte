/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pasta de saída configurável para que um `next build` de verificação não
  // escreva por cima do cache de um `next dev` em execução. Quando isso
  // acontece, o dev server passa a procurar chunks que deixaram de existir e
  // quebra com "Cannot find module './135.js'" — erro que parece bug da
  // aplicação e é só cache sobrescrito.
  //   NEXT_DIST_DIR=.next-verify npm run build --workspace @a-ponte/web
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // O pacote de contratos é TypeScript cru do workspace: o Next precisa
  // compilá-lo junto em vez de esperar um dist pronto.
  transpilePackages: ['@a-ponte/contracts'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
