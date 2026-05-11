// Next.js 앱의 기본 런타임 구성을 정의합니다.
import type { NextConfig } from "next";
import workspacePackageJson from "../package.json";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@psstudio/shared"],
  env: {
    NEXT_PUBLIC_APP_VERSION: workspacePackageJson.version,
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
