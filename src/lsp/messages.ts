// 语言服务面向用户的文案(诊断之外的 UI 文案:快速修复标题、服务提示)。
// 诊断消息保持英文(与 krpano 官方文档术语一致),这里只处理 VS Code 界面里出现的文案。
export type Locale = 'zh' | 'en'

/** 由 VS Code 的 vscode.env.language(如 "zh-cn"、"en")判断界面语言 */
export function localeOf(value?: string): Locale {
  return value && value.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

interface Messages {
  changeToTag: (tag: string) => string
  changeToJavascript: string
  removeLangAttribute: string
  createAction: (name: string) => string
  renameDuplicate: (scope: string, name: string) => string
  renameScopeScene: string
  renameScopeFile: string
  changeAttribute: (name: string) => string
  extractStyle: (name: string) => string
  extractAction: (name: string) => string
  createFile: (url: string) => string
  serverStarting: string
  serverStopped: string
  serverStoppedDetail: (detail: string) => string
  serverFailedToLoad: string
  showLogs: string
  noActiveEditor: string
  notKrpanoDocument: string
  sceneInserted: (name: string) => string
  formattingAllXml: string
  noXmlFiles: string
  formatAllXmlDone: (formatted: number, skipped: number) => string
}

const tables: Record<Locale, Messages> = {
  en: {
    changeToTag: tag => `Change to <${tag}>`,
    changeToJavascript: 'Change to type="Javascript"',
    removeLangAttribute: 'Remove the unsupported lang attribute',
    createAction: name => `Create action "${name}"`,
    renameDuplicate: (scope, name) => `Rename this duplicate (and ${scope}) to "${name}"`,
    renameScopeScene: 'its references in this scene',
    renameScopeFile: 'its references',
    changeAttribute: name => `Change attribute to "${name}"`,
    extractStyle: name => `Extract attributes to style "${name}"`,
    extractAction: name => `Extract selection to action "${name}"`,
    createFile: url => `Create file "${url}"`,
    serverStarting: 'krpano: starting the language service...',
    serverStopped: 'krpano: the language service stopped. Syntax highlighting and formatting keep working; see the log for details.',
    serverStoppedDetail: detail => `krpano: the language service stopped (${detail}). Syntax highlighting and formatting keep working.`,
    serverFailedToLoad: 'krpano: the language service failed to load. Syntax highlighting and formatting keep working.',
    showLogs: 'Show log',
    noActiveEditor: 'krpano: open an XML file first.',
    notKrpanoDocument: 'krpano: this command works on krpano XML documents (language mode "krpano XML").',
    sceneInserted: name => `krpano: inserted the scene skeleton "${name}".`,
    formattingAllXml: 'krpano: formatting all XML files...',
    noXmlFiles: 'krpano: no XML files found in this workspace.',
    formatAllXmlDone: (formatted, skipped) => `krpano: formatted ${formatted} file(s), skipped ${skipped}.`,
  },
  zh: {
    changeToTag: tag => `改为 <${tag}>`,
    changeToJavascript: '改为 type="Javascript"',
    removeLangAttribute: '删除不受支持的 lang 属性',
    createAction: name => `创建动作 "${name}"`,
    renameDuplicate: (scope, name) => `重命名这个重名定义(连同${scope})为 "${name}"`,
    renameScopeScene: '本 scene 内的引用',
    renameScopeFile: '本文件内的引用',
    changeAttribute: name => `改为属性 "${name}"`,
    extractStyle: name => `把属性提取为 style "${name}"`,
    extractAction: name => `把选区提取为 action "${name}"`,
    createFile: url => `创建文件 "${url}"`,
    serverStarting: 'krpano:正在启动语言服务…',
    serverStopped: 'krpano:语言服务已停止。高亮与格式化不受影响,详情见日志。',
    serverStoppedDetail: detail => `krpano:语言服务已停止(${detail})。高亮与格式化不受影响。`,
    serverFailedToLoad: 'krpano:语言服务加载失败。高亮与格式化不受影响。',
    showLogs: '查看日志',
    noActiveEditor: 'krpano:请先打开一个 XML 文件。',
    notKrpanoDocument: 'krpano:此命令作用于 krpano XML 文档(语言模式为 "krpano XML")。',
    sceneInserted: name => `krpano:已插入 scene 骨架 "${name}"。`,
    formattingAllXml: 'krpano:正在格式化工作区所有 XML 文件…',
    noXmlFiles: 'krpano:工作区里没有找到 XML 文件。',
    formatAllXmlDone: (formatted, skipped) => `krpano:已格式化 ${formatted} 个文件,跳过 ${skipped} 个。`,
  },
}

export function messagesFor(locale: Locale | undefined): Messages {
  return tables[locale === 'zh' ? 'zh' : 'en']
}
