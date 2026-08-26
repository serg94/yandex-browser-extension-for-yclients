(() => {
  'use strict'

  /**
   * YClients Tools
   *
   * 1. Cleans `.workspace-grid-record-comment` elements containing the
   *    auto-generated "Запись создана через Яндекс.Карты" text:
   *    - exact match  -> the element is hidden;
   *    - partial match (the text without its wrapping brackets) -> that part
   *      is stripped from the comment, the rest stays.
   * 2. Appends a "new: X / TOTAL" badge to every `.workspace-header__left`,
   *    where X is the number of "new" records and TOTAL is the number of
   *    records on the page. The badge shows "new: 0 / TOTAL" only when the
   *    page is settled (the `.page-loading-stub` is not visible), so it
   *    doesn't blink with "new: 0" while loading.
   * 3. Hovering a badge highlights the matching `.workspace-grid-record` rows
   *    with `workspace-grid-record__highlighted`. Clicking a badge pins the
   *    highlight (it stays after the mouse leaves); clicking again unpins and
   *    returns to hover-only behavior.
   *
   * The site re-renders dynamically, so besides an initial scan we watch the
   * DOM with a MutationObserver (immediate updates) and debounce a full
   * re-scan to catch anything the observer missed.
   */

  /* ------------------------------ Selectors ------------------------------ */

  const SELECTOR = '.workspace-grid-record-comment'
  const HEADER_SELECTOR = '.workspace-header__left'
  const RECORD_SELECTOR = '[data-locator^="client_name_new_timetable-record_"]'
  const RECORD_ROW_SELECTOR = '.workspace-grid-record'
  const LOADING_SELECTOR = '.page-loading-stub'
  const HIGHLIGHT_CLASS = 'workspace-grid-record__highlighted'

  // Exact comment text to look for. Curly/typographic quotes are normalized
  // below, so “Яндекс.Карты” / «Яндекс.Карты» variants match too.
  const TARGET_TEXT =
    '(Запись создана через "Яндекс.Карты". Пожалуйста, используйте номер мобильного телефона для связи с клиентом.)'

  /* ------------------------------- 1. Comments ------------------------------ */

  /** Collapse whitespace, normalize quotes, trim. */
  const normalizeText = (text) =>
    String(text)
      .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
      .replace(/\s+/g, ' ')
      .trim()

  const NORMALIZED_TARGET = normalizeText(TARGET_TEXT)
  // Same text without the wrapping parentheses — to strip from mixed comments.
  const NORMALIZED_TARGET_NO_BRACKETS = normalizeText(
    TARGET_TEXT.replace(/^\(/, '').replace(/\)$/, ''),
  )

  /**
   * Hide the comment if its text is exactly the target; otherwise strip the
   * target part (without brackets) from the comment, keeping the rest.
   */
  function processElement(el) {
    if (!(el instanceof Element) || !el.matches(SELECTOR)) return
    const text = normalizeText(el.textContent || '')
    if (text === NORMALIZED_TARGET) {
      el.style.display = 'none'
    } else if (text.includes(NORMALIZED_TARGET_NO_BRACKETS)) {
      el.textContent = text.replace(NORMALIZED_TARGET_NO_BRACKETS, '').trim()
    }
  }

  /** Process a root (the document or an added subtree). */
  function processRoot(root) {
    if (root instanceof Element) processElement(root)
    root.querySelectorAll?.(SELECTOR)?.forEach(processElement)
  }

  /* ------------------------------- 2. Badge ------------------------------- */

  // One badge per header element.
  const badgeByHeader = new WeakMap()

  /** Get (creating if needed) the badge element for a header. */
  function getBadge(header) {
    let badge = badgeByHeader.get(header)
    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'yc-new-records-badge'
      badge.style.cssText = [
        'margin-left:12px',
        'padding:2px 8px',
        'border-radius:10px',
        'background:#fff',
        'color:#333',
        'font-size:12px',
        'font-weight:600',
        'line-height:1.4',
        'white-space:nowrap',
        'display:inline-block',
        'vertical-align:middle',
        'cursor:pointer',
      ].join(';')
      header.appendChild(badge)
      badgeByHeader.set(header, badge)
      badge.addEventListener('mouseenter', () => {
        hoverActive = true
        refreshHighlight()
      })
      badge.addEventListener('mouseleave', () => {
        hoverActive = false
        refreshHighlight()
      })
      // Click toggles the pinned highlight; hover/blur only apply when unpinned.
      badge.addEventListener('click', () => {
        pinned = !pinned
        refreshHighlight()
      })
    }
    return badge
  }

  /** True while the page's loading stub is visible (records not loaded yet). */
  function isPageLoading() {
    const stub = document.querySelector(LOADING_SELECTOR)
    if (!stub) return false
    const style = getComputedStyle(stub)
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      stub.getClientRects().length > 0
    )
  }

  /** Refresh the counter badge in every header. */
  function updateBadges() {
    const count = document.querySelectorAll(RECORD_SELECTOR).length
    const total = document.querySelectorAll(RECORD_ROW_SELECTOR).length
    // Still loading with no records — leave the badges untouched.
    if (count === 0 && isPageLoading()) return
    const text = `new: ${count} from ${total}`
    for (const header of document.querySelectorAll(HEADER_SELECTOR)) {
      const badge = getBadge(header)
      if (badge.textContent !== text) badge.textContent = text
    }
  }

  /* ------------------------------ 3. Highlight ------------------------------ */

  // Rows we highlighted; hover state flag and click-pinned state.
  const highlightedByUs = new Set()
  let hoverActive = false
  let pinned = false

  /** Record rows that contain (or are) a matching "new" element. */
  function findNewRecordRows() {
    return [...document.querySelectorAll(RECORD_ROW_SELECTOR)].filter(
      (row) => row.matches(RECORD_SELECTOR) || row.querySelector(RECORD_SELECTOR),
    )
  }

  /** Add (on = true) or remove (on = false) the highlight class. */
  function setHighlight(on) {
    for (const row of highlightedByUs) row.classList.remove(HIGHLIGHT_CLASS)
    highlightedByUs.clear()
    if (!on) return
    for (const row of findNewRecordRows()) {
      row.classList.add(HIGHLIGHT_CLASS)
      highlightedByUs.add(row)
    }
  }

  /** Highlight while a badge is hovered or pinned by a click. */
  function refreshHighlight() {
    setHighlight(pinned || hoverActive)
  }

  /* ------------------------------ Shared refresh ------------------------------ */

  /** Full refresh: clean comments + keep highlights in sync. */
  function scanDocument() {
    processRoot(document)
    if (pinned || hoverActive) refreshHighlight()
  }

  // Debounced full re-scan: catches what the observer might have missed
  // (e.g. an existing element's text replaced in place).
  let rescanTimer = null

  function scheduleRescan() {
    clearTimeout(rescanTimer)
    rescanTimer = setTimeout(scanDocument, 150)
  }

  // Watch for DOM changes: clean new comments, refresh counters immediately,
  // re-check the badge when the loading stub's visibility changes.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      switch (mutation.type) {
        case 'childList':
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) processRoot(node)
          }
          if (mutation.addedNodes.length || mutation.removedNodes.length) {
            updateBadges()
            scheduleRescan()
          }
          break
        case 'characterData': {
          const parent = mutation.target.parentElement
          if (parent) processElement(parent)
          scheduleRescan()
          break
        }
        case 'attributes':
          updateBadges()
          break
      }
    }
  })

  function init() {
    scanDocument()
    updateBadges()
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
  } else {
    init()
  }

  // Clean up the observer if the script is ever re-injected.
  window.addEventListener('unload', () => observer.disconnect(), { once: true })
})()
