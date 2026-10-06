/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // exceljs nicht bündeln, sondern als Node-Modul laden
  serverExternalPackages: ['exceljs'],
  experimental: {
    // Upload der Excel-Jahrespläne per Server Action (Standard wäre 1 MB)
    serverActions: { bodySizeLimit: '4mb' },
  },
};
export default nextConfig;
