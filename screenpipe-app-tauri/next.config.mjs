/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',
    images: {
        unoptimized: true,
    },
    devIndicators: {
        appIsrStatus: false,
        buildActivity: false,
        buildActivityPosition: 'bottom-right',
    },
    eslint: {
        // Disable eslint during builds - we run it separately in CI
        ignoreDuringBuilds: true,
    },
}
export default nextConfig;

