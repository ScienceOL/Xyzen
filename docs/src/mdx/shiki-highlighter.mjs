import { createHighlighter } from 'shiki'

// 在全局对象上缓存高亮器实例
globalThis.__shikiHighlighter = globalThis.__shikiHighlighter || undefined
globalThis.__shikiHighlighterPromise =
  globalThis.__shikiHighlighterPromise || undefined

// 支持的编程语言列表
const SUPPORTED_LANGUAGES = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'css',
  'html',
  'json',
  'markdown',
  'mdx',
  'bash',
  'shell',
  'sh',
  'zsh',
  'python',
  'java',
  'go',
  'rust',
  'php',
  'ruby',
  'yaml',
  'yml',
  'xml',
  'sql',
  'mermaid',
  'dockerfile',
  'docker',
  'c',
  'cpp',
  'csharp',
  'swift',
  'kotlin',
  'scala',
  'r',
  'lua',
  'perl',
  'powershell',
  'vim',
  'toml',
  'ini',
  'graphql',
  'svelte',
  'vue',
  'nginx',
  'apache',
  'makefile',
  'cmake',
  'diff',
  'git-commit',
  'git-rebase',
  'tex',
  'latex',
  'bibtex',
]

// 支持的主题列表
const SUPPORTED_THEMES = ['github-dark-default']

/**
 * 获取全局 Shiki 高亮器实例
 * 如果实例不存在，将创建一个新的实例
 * 使用全局缓存确保跨模块只创建一个实例
 * @returns {Promise<import('shiki').Highlighter>}
 */
export async function getHighlighter() {
  if (globalThis.__shikiHighlighter) {
    return globalThis.__shikiHighlighter
  }

  if (globalThis.__shikiHighlighterPromise) {
    return globalThis.__shikiHighlighterPromise
  }

  globalThis.__shikiHighlighterPromise = createHighlighter({
    themes: SUPPORTED_THEMES,
    langs: SUPPORTED_LANGUAGES,
  }).then((instance) => {
    globalThis.__shikiHighlighter = instance
    return instance
  })

  return globalThis.__shikiHighlighterPromise
}

/**
 * 释放高亮器实例
 * 在应用关闭或需要重新初始化时调用
 */
export function disposeHighlighter() {
  if (globalThis.__shikiHighlighter) {
    globalThis.__shikiHighlighter.dispose()
    globalThis.__shikiHighlighter = undefined
    globalThis.__shikiHighlighterPromise = undefined
  }
}

/**
 * 高亮代码
 * @param {string} code 要高亮的代码
 * @param {string} lang 编程语言
 * @param {string} theme 主题，默认为 'github-dark-default'
 * @returns {Promise<string>} 高亮后的 HTML 字符串
 */
export async function highlightCode(code, lang, theme = 'github-dark-default') {
  const highlighterInstance = await getHighlighter()

  return highlighterInstance.codeToHtml(code, {
    lang,
    theme,
  })
}

/**
 * 检查是否支持指定的编程语言
 * @param {string} lang 编程语言
 * @returns {boolean}
 */
export function isSupportedLanguage(lang) {
  return SUPPORTED_LANGUAGES.includes(lang)
}

/**
 * 检查是否支持指定的主题
 * @param {string} theme 主题名称
 * @returns {boolean}
 */
export function isSupportedTheme(theme) {
  return SUPPORTED_THEMES.includes(theme)
}
