import nextMDX from '@next/mdx'
import createNextIntlPlugin from 'next-intl/plugin'

import { recmaPlugins } from './src/mdx/recma.mjs'
import { rehypePlugins } from './src/mdx/rehype.mjs'
import { remarkPlugins } from './src/mdx/remark.mjs'
import withSearch from './src/mdx/search.mjs'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const withMDX = nextMDX({
  options: {
    remarkPlugins,
    rehypePlugins,
    recmaPlugins,
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath: '/docs',
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'mdx'],
  allowedDevOrigins: ['127.0.0.1'],
  outputFileTracingIncludes: {
    '**/*': ['./src/app/**/*.mdx'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.sciol.ac.cn',
        pathname: '/library/docs/**',
      },
    ],
  },
  turbopack: {
    resolveExtensions: ['.mdx', '.tsx', '.ts', '.jsx', '.js', '.json'],
    resolveAlias: {
      underscore: 'lodash',
    },
  },
}

export default withNextIntl(withSearch(withMDX(nextConfig)))
