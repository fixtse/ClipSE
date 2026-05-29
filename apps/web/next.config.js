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
	allowedDevOrigins: ["127.0.0.1", "localhost"],
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
	serverExternalPackages: ["sharp"],
	webpack: (config, { isServer }) => {
		// Exclude server-only packages from client bundle
		if (!isServer) {
			config.resolve.alias = {
				...config.resolve.alias,
				sharp$: false,
			};
		}
		return config;
	},
	turbopack: {},
};

export default config;
