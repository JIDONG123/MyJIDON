/**
 * 全站复制防护：禁止静态文本复制、右键、拖拽复制与选中
 * 表单输入区、可编辑元素除外；在 main.js 调用一次即可
 */

import '../styles/copy-guard.css'

const EDITABLE_SELECTOR = [
  'input',
  'textarea',
  'select',
  'option',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[contenteditable]',
  '.el-input__inner',
  '.el-textarea__inner',
  '.el-select__input',
  '.el-select-v2__combobox-input',
  '.el-cascader__search-input',
  '.el-date-editor input',
  '.el-autocomplete .el-input__inner',
  '.el-mention__input',
  '.el-input-number input',
  '.allow-copy',
  '.allow-select',
  '[data-allow-copy="true"]',
].join(',')

let installed = false

function resolveElement(target) {
  if (!target) return null
  if (target instanceof Element) return target
  if (target.nodeType === Node.TEXT_NODE) return target.parentElement
  return null
}

/** 是否处于可输入/可编辑区域（允许选中与录入） */
export function isEditableTarget(target) {
  const el = resolveElement(target)
  if (!el) return false
  if (el.closest(EDITABLE_SELECTOR)) return true
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return false
}

function blockUnlessEditable(handler) {
  return (event) => {
    if (isEditableTarget(event.target)) return
    handler(event)
  }
}

function installCopyGuard() {
  if (installed || typeof document === 'undefined') return
  installed = true

  document.documentElement.classList.add('sg-copy-guard')

  document.addEventListener(
    'copy',
    blockUnlessEditable((e) => {
      e.preventDefault()
    }),
    true
  )

  document.addEventListener(
    'cut',
    blockUnlessEditable((e) => {
      e.preventDefault()
    }),
    true
  )

  document.addEventListener(
    'contextmenu',
    blockUnlessEditable((e) => {
      e.preventDefault()
    }),
    true
  )

  document.addEventListener(
    'selectstart',
    blockUnlessEditable((e) => {
      e.preventDefault()
    }),
    true
  )

  document.addEventListener(
    'dragstart',
    blockUnlessEditable((e) => {
      e.preventDefault()
    }),
    true
  )
}

export default installCopyGuard
