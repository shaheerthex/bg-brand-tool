/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @imgly/background-removal ships wasm/onnx assets that Next's webpack
  // build shouldn't try to parse as JS.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    return config;
  },
};

module.exports = nextConfig;
