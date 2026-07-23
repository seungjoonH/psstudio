// Next.js 앱의 기본 런타임 구성을 정의합니다.
import type { NextConfig } from "next";
import rootPackageJson from "../package.json";

function readAppVersion(): string {
  const version = (rootPackageJson as { version?: string }).version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("Missing version in package.json");
  }
  return version;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@psstudio/shared"],
  env: {
    NEXT_PUBLIC_APP_VERSION: readAppVersion(),
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
