(() => {
  'use strict'

  /**
   * YClients Tools
   *
   * 1. Hides elements matching `.workspace-grid-record-comment` whose text is
   *    exactly the auto-generated "Запись создана через Яндекс.Карты" comment.
   *    If a comment contains that text (without its wrapping brackets) next to
   *    other content, only the generated part is removed from the comment text.
   * 2. Appends a "new: N" counter badge at the end of every
   *    `.workspace-header__left` element, where N is the number of elements
   *    matching `[data-locator^="client_name_new_timetable-record_"]`.
   *    The badge is never hidden; it shows "new: 0" only when the page's
   *    loading stub (.page-loading-stub) is not visible, so it doesn't blink
   *    with "new: 0" while records are still loading.
   * 3. While hovering a badge, adds the class
   *    `workspace-grid-record__highlighted` to every `.workspace-grid-record`
   *    row that contains a matching element. The class is removed on hover-out.
   *
   * The site renders records dynamically (AJAX / framework re-renders), so we:
   *   1. Run an initial scan on page load.
   *   2. Watch the DOM with a MutationObserver and hide new matches / refresh
   *      counters / keep highlights fresh as the page changes.
   *   3. Debounce a full re-scan to catch any case the observer missed.
   */

  /* ------------------------- 1. Comment hiding ------------------------- */

  // Selector for the comment elements.
  const SELECTOR = '.workspace-grid-record-comment'

  // The exact text to look for. Curly/typographic quotes are normalized below,
  // so this also matches “Яндекс.Карты” and «Яндекс.Карты» variants.
  const TARGET_TEXT =
    '(Запись создана через "Яндекс.Карты". Пожалуйста, используйте номер мобильного телефона для связи с клиентом.)'

  /**
   * Normalize text for comparison:
   * - collapse all whitespace runs to a single space,
   * - convert typographic quotes („ “ ” « ») to straight double quotes,
   * - trim leading/trailing whitespace.
   */
  function normalizeText(text) {
    return String(text)
      .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const NORMALIZED_TARGET = normalizeText(TARGET_TEXT)

  // The same text with the wrapping parentheses stripped. Used to detect
  // comments that contain the generated text alongside other content.
  const NORMALIZED_TARGET_NO_BRACKETS = normalizeText(
    TARGET_TEXT.replace(/^\(/, '').replace(/\)$/, ''),
  )

  /** Hide the element (inline style wins over any stylesheet rules). */
  function hideElement(el) {
    if (el.style.display !== 'none') {
      el.style.display = 'none'
    }
  }

  /**
   * Check a single element:
   * - hide it if its text is exactly the target text;
   * - otherwise, if its text contains the target text (without its wrapping
   *   brackets) next to other content, remove just that part from textContent.
   */
  function processElement(el) {
    if (!(el instanceof Element) || !el.matches(SELECTOR)) {
      return
    }
    const text = normalizeText(el.textContent || '')
    if (text === NORMALIZED_TARGET) {
      hideElement(el)
      return
    }
    if (text.includes(NORMALIZED_TARGET_NO_BRACKETS)) {
      el.textContent = text.replace(NORMALIZED_TARGET_NO_BRACKETS, '').trim()
    }
  }

  /** Scan a root (document or an added subtree) for matching comments. */
  function processRoot(root) {
    if (root instanceof Element) {
      processElement(root)
    }
    if (root.querySelectorAll) {
      const found = root.querySelectorAll(SELECTOR)
      for (const el of found) {
        processElement(el)
      }
    }
  }

  /* ---------------------- 2. "new" counter badge ---------------------- */

  // Headers to append the counter badge to.
  const HEADER_SELECTOR = '.workspace-header__left'
  // Elements to count ("new" timetable records created from Yandex Maps, etc.).
  const RECORD_SELECTOR = '[data-locator^="client_name_new_timetable-record_"]'

  // Keeps the single badge element created for each header element.
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
        'background:#ffffff',
        'color:#333',
        'font-size:12px',
        'font-weight:600',
        'line-height:1.4',
        'white-space:nowrap',
        'display:inline-block',
        'vertical-align:middle',
        'cursor:pointer',
      ].join(';')
      // Append at the end of the header.
      header.appendChild(badge)
      badgeByHeader.set(header, badge)

      // Hover -> highlight the "new" record rows on the page.
      badge.addEventListener('mouseenter', () => setHighlight(true))
      badge.addEventListener('mouseleave', () => setHighlight(false))
    }
    return badge
  }

  // The page's loading stub, shown while records are still being loaded.
  const LOADING_SELECTOR = '.page-loading-stub'

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

  /** Refresh the counter badge in every header on the page. */
  function updateBadges() {
    const count = document.querySelectorAll(RECORD_SELECTOR).length
    const pageLoading = isPageLoading()
    const headers = document.querySelectorAll(HEADER_SELECTOR)
    for (const header of headers) {
      const badge = getBadge(header)
      if (count > 0) {
        const text = 'new: ' + count
        if (badge.textContent !== text) {
          badge.textContent = text
        }
      } else if (!pageLoading) {
        // Page settled and there really are no new records — safe to show 0
        // (while the loading stub is visible we leave the text untouched so
        // the badge doesn't blink with "new: 0" during loading).
        if (badge.textContent !== 'new: 0') {
          badge.textContent = 'new: 0'
        }
      }
    }
  }

  /* ------------------- 3. Hover highlight of new records ------------------- */

  // Record rows to highlight.
  const RECORD_ROW_SELECTOR = '.workspace-grid-record'
  // Class added while a badge is hovered.
  const HIGHLIGHT_CLASS = 'workspace-grid-record__highlighted'

  // Rows we have highlighted; hover state flag.
  const highlightedByUs = new Set()
  let hoverActive = false

  /** All record rows that contain (or are) a matching "new" element. */
  function findNewRecordRows() {
    const rows = document.querySelectorAll(RECORD_ROW_SELECTOR)
    const result = []
    for (const row of rows) {
      if (row.matches(RECORD_SELECTOR) || row.querySelector(RECORD_SELECTOR)) {
        result.push(row)
      }
    }
    return result
  }

  /**
   * Apply (on = true) or remove (on = false) the highlight class.
   * Rebuilds the highlight set each time so it stays correct while the page
   * changes during a hover.
   */
  function setHighlight(on) {
    // Remove any classes added in a previous pass.
    for (const row of highlightedByUs) {
      row.classList.remove(HIGHLIGHT_CLASS)
    }
    highlightedByUs.clear()
    hoverActive = on
    if (on) {
      for (const row of findNewRecordRows()) {
        row.classList.add(HIGHLIGHT_CLASS)
        highlightedByUs.add(row)
      }
    }
  }

  /* --------------------------- Shared refresh --------------------------- */

  /** Full document refresh: hide comments + keep highlights fresh. */
  function scanDocument() {
    processRoot(document)
    if (hoverActive) {
      // Keep the highlight in sync while the user is hovering a badge.
      setHighlight(true)
    }
  }

  // Debounced full re-scan: catches matches the observer might have missed
  // (e.g. when an existing element's text is replaced in place).
  let rescanTimer = null

  function scheduleRescan() {
    if (rescanTimer) {
      clearTimeout(rescanTimer)
    }
    rescanTimer = setTimeout(scanDocument, 150)
  }

  // Watch for dynamically added nodes and text changes.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Hide matches inside the newly added subtree immediately.
            processRoot(node)
          }
        }
        if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
          // Update the counter immediately, outside the debounced re-scan.
          updateBadges()
          scheduleRescan()
        }
      } else if (mutation.type === 'characterData') {
        // Text of an existing node changed — re-check its parent element.
        const parent = mutation.target.parentElement
        if (parent) {
          processElement(parent)
        }
        scheduleRescan()
      } else if (mutation.type === 'attributes') {
        // The loading stub's visibility may have changed (class/style).
        updateBadges()
      }
    }
  })

  function init() {
    // Initial pass over already-rendered content.
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

  // Clean up the observer if the script is ever re-injected
  // (e.g. after an extension reload on the same page).
  window.addEventListener('unload', () => observer.disconnect(), { once: true })
})()
