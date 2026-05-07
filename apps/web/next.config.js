/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */

import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
	output: "standalone",
	experimental: {
		serverActions: {
			bodySizeLimit: "256mb",
		},
	},
	transpilePackages: ["@electric-sql/pglite"],
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
		],
	},
	async headers() {
		return [
			{
				// Enable SharedArrayBuffer for WebGPU and Whisper model only on pages that need it
				// This allows browser extensions to work on other pages
				source: "/transcribe/:path*",
				headers: [
					{ key: "Cross-Origin-Opener-Policy", value: "same-origin" },
					{ key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
				],
			},
		];
	},
	serverExternalPackages: ["sharp", "browser-runtime"],
	webpack: (config, { isServer }) => {
		// Exclude server-only packages from client bundle
		if (!isServer) {
			config.resolve.alias = {
				...config.resolve.alias,
				sharp$: false,
				"browser-runtime$": false,
			};
		}
		return config;
	},
	turbopack: {},
};

export default config;
