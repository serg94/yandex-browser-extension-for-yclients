(() => {
  'use strict';

  /**
   * YClients Tools
   *
   * 1. Hides elements matching `.workspace-grid-record-comment` whose text is
   *    exactly the auto-generated "Запись создана через Яндекс.Карты" comment.
   * 2. Appends a "new: N" counter badge at the end of every
   *    `.workspace-header__left` element, where N is the number of elements
   *    matching `[data-locator^="client_name_new_timetable-record_"]`.
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
  const SELECTOR = '.workspace-grid-record-comment';

  // The exact text to look for. Curly/typographic quotes are normalized below,
  // so this also matches “Яндекс.Карты” and «Яндекс.Карты» variants.
  const TARGET_TEXT =
    '(Запись создана через "Яндекс.Карты". Пожалуйста, используйте номер мобильного телефона для связи с клиентом.)';

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
      .trim();
  }

  const NORMALIZED_TARGET = normalizeText(TARGET_TEXT);

  /** Returns true if the element is a comment with exactly the target text. */
  function isTargetComment(el) {
    return (
      el instanceof Element &&
      el.matches(SELECTOR) &&
      normalizeText(el.textContent || '') === NORMALIZED_TARGET
    );
  }

  /** Hide the element (inline style wins over any stylesheet rules). */
  function hideElement(el) {
    if (el.style.display !== 'none') {
      el.style.display = 'none';
    }
  }

  /** Check a single element and hide it if it matches. */
  function processElement(el) {
    if (isTargetComment(el)) {
      hideElement(el);
    }
  }

  /** Scan a root (document or an added subtree) for matching comments. */
  function processRoot(root) {
    if (root instanceof Element) {
      processElement(root);
    }
    if (root.querySelectorAll) {
      const found = root.querySelectorAll(SELECTOR);
      for (const el of found) {
        processElement(el);
      }
    }
  }

  /* ---------------------- 2. "new" counter badge ---------------------- */

  // Headers to append the counter badge to.
  const HEADER_SELECTOR = '.workspace-header__left';
  // Elements to count ("new" timetable records created from Yandex Maps, etc.).
  const RECORD_SELECTOR = '[data-locator^="client_name_new_timetable-record_"]';

  // Keeps the single badge element created for each header element.
  const badgeByHeader = new WeakMap();

  /** Get (creating if needed) the badge element for a header. */
  function getBadge(header) {
    let badge = badgeByHeader.get(header);
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'yc-new-records-badge';
      badge.style.cssText = [
        'margin-left:12px',
        'padding:2px 8px',
        'border-radius:10px',
        'background:#f0f0f0',
        'color:#333',
        'font-size:12px',
        'font-weight:600',
        'line-height:1.4',
        'white-space:nowrap',
        'display:inline-block',
        'vertical-align:middle',
        'cursor:pointer',
      ].join(';');
      // Append at the end of the header.
      header.appendChild(badge);
      badgeByHeader.set(header, badge);

      // Hover -> highlight the "new" record rows on the page.
      badge.addEventListener('mouseenter', () => setHighlight(true));
      badge.addEventListener('mouseleave', () => setHighlight(false));
    }
    return badge;
  }

  /** Refresh the counter badge in every header on the page. */
  function updateBadges() {
    const count = document.querySelectorAll(RECORD_SELECTOR).length;
    const text = 'new: ' + count;
    const headers = document.querySelectorAll(HEADER_SELECTOR);
    for (const header of headers) {
      const badge = getBadge(header);
      if (badge.textContent !== text) {
        badge.textContent = text;
      }
    }
  }

  /* ------------------- 3. Hover highlight of new records ------------------- */

  // Record rows to highlight.
  const RECORD_ROW_SELECTOR = '.workspace-grid-record';
  // Class added while a badge is hovered.
  const HIGHLIGHT_CLASS = 'workspace-grid-record__highlighted';

  // Rows we have highlighted; hover state flag.
  const highlightedByUs = new Set();
  let hoverActive = false;

  /** All record rows that contain (or are) a matching "new" element. */
  function findNewRecordRows() {
    const rows = document.querySelectorAll(RECORD_ROW_SELECTOR);
    const result = [];
    for (const row of rows) {
      if (row.matches(RECORD_SELECTOR) || row.querySelector(RECORD_SELECTOR)) {
        result.push(row);
      }
    }
    return result;
  }

  /**
   * Apply (on = true) or remove (on = false) the highlight class.
   * Rebuilds the highlight set each time so it stays correct while the page
   * changes during a hover.
   */
  function setHighlight(on) {
    // Remove any classes added in a previous pass.
    for (const row of highlightedByUs) {
      row.classList.remove(HIGHLIGHT_CLASS);
    }
    highlightedByUs.clear();
    hoverActive = on;
    if (on) {
      for (const row of findNewRecordRows()) {
        row.classList.add(HIGHLIGHT_CLASS);
        highlightedByUs.add(row);
      }
    }
  }

  /* --------------------------- Shared refresh --------------------------- */

  /** Full document refresh: hide comments + update counters + highlight. */
  function scanDocument() {
    processRoot(document);
    updateBadges();
    if (hoverActive) {
      // Keep the highlight in sync while the user is hovering a badge.
      setHighlight(true);
    }
  }

  // Debounced full re-scan: catches matches the observer might have missed
  // (e.g. when an existing element's text is replaced in place).
  let rescanTimer = null;
  function scheduleRescan() {
    if (rescanTimer) {
      clearTimeout(rescanTimer);
    }
    rescanTimer = setTimeout(scanDocument, 150);
  }

  // Watch for dynamically added nodes and text changes.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Hide matches inside the newly added subtree immediately.
            processRoot(node);
          }
        }
        if (mutation.addedNodes.length > 0) {
          scheduleRescan();
        }
      } else if (mutation.type === 'characterData') {
        // Text of an existing node changed — re-check its parent element.
        const parent = mutation.target.parentElement;
        if (parent) {
          processElement(parent);
        }
        scheduleRescan();
      }
    }
  });

  function init() {
    // Initial pass over already-rendered content.
    scanDocument();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // Clean up the observer if the script is ever re-injected
  // (e.g. after an extension reload on the same page).
  window.addEventListener('unload', () => observer.disconnect(), { once: true });
})();
