/** 在线实训 / Code Runner 五语言常量（与后端 codeRunLanguageSpec 对齐） */
export const CODE_RUN_LANGUAGES = [
  { value: 'python', label: 'Python', entryFile: 'main.py' },
  { value: 'node', label: 'Node.js', entryFile: 'main.js' },
  { value: 'c', label: 'C', entryFile: 'main.c' },
  { value: 'cpp', label: 'C++', entryFile: 'main.cpp' },
  { value: 'java', label: 'Java', entryFile: 'Main.java' },
]

export const DEFAULT_STARTER = {
  python: 'print("Hello")\n',
  node: 'console.log("Hello");\n',
  c: '#include <stdio.h>\nint main(void) {\n  printf("Hello\\n");\n  return 0;\n}\n',
  cpp: '#include <iostream>\nint main() {\n  std::cout << "Hello" << std::endl;\n  return 0;\n}\n',
  java: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello");\n  }\n}\n',
}

export function langLabel(code) {
  return CODE_RUN_LANGUAGES.find((x) => x.value === code)?.label || code || '—'
}

export function defaultEntryFile(language) {
  return CODE_RUN_LANGUAGES.find((x) => x.value === language)?.entryFile || 'main.py'
}

export function defaultStarterCode(language) {
  return DEFAULT_STARTER[language] || ''
}

export function editorPlaceholder(language) {
  const map = {
    python: '# 在此编写 Python 代码',
    node: '// 在此编写 Node.js 代码',
    c: '// 在此编写 C 代码',
    cpp: '// 在此编写 C++ 代码',
    java: '// 在此编写 Java 代码（主类 Main）',
  }
  return map[language] || '# 在此编写代码'
}

export function monacoLanguage(language) {
  const map = {
    python: 'python',
    node: 'javascript',
    c: 'c',
    cpp: 'cpp',
    java: 'java',
  }
  return map[language] || 'plaintext'
}

export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
