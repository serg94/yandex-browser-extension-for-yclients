# YClients: Hide Yandex Maps Comments

A Yandex Browser (and Chrome/Chromium) extension with tools for
[yclients.com](https://yclients.com):

## What it does

1. **Hides auto-generated comments.** Finds all elements matching the selector
   `.workspace-grid-record-comment` and hides only the ones whose full text
   equals (after whitespace/quote normalization):

   ```
   (Запись создана через "Яндекс.Карты". Пожалуйста, используйте номер мобильного телефона для связи с клиентом.)
   ```

2. **Shows a "new" records counter.** Appends a `new: N` badge at the end of
   every `.workspace-header__left` element, where `N` is the number of elements
   matching `[data-locator^="client_name_new_timetable-record_"]` currently on
   the page.

3. **Highlights new records on hover.** While the mouse is over a badge, every
   `.workspace-grid-record` row that contains a matching
   `[data-locator^="client_name_new_timetable-record_"]` element gets the class
   `workspace-grid-record__highlighted` (the site's own styles decide how it
   looks). The class is removed as soon as the mouse leaves the badge.

All features keep working on dynamically loaded content: a `MutationObserver`
watches the page and hides new comments / refreshes counters / keeps highlights
in sync as soon as the DOM changes, plus a debounced full re-scan catches
anything the observer misses (e.g. text replaced in place).

## Installation (Yandex Browser)

1. Download / copy this folder somewhere on your disk.
2. Open `browser://extensions` in Yandex Browser.
3. Enable **Developer mode** (Режим разработчика) — toggle in the top-right corner.
4. Click **Load unpacked extension** (Загрузить распакованное расширение) and
   select this folder.
5. Open your YClients workspace — the comments are hidden automatically, the
   counter badge appears in the header, and hovering it highlights the new
   records. New comments/records appearing during work are handled too, without
   reloading the page.

The same steps work in Chrome/Edge (use `chrome://extensions` / `edge://extensions`).

## Files

| File          | Purpose                                                    |
| ------------- | ---------------------------------------------------------- |
| `manifest.json` | Manifest V3 extension definition.                        |
| `content.js`    | Content script: comment hiding + counter badge + hover highlight + `MutationObserver`. |
| `icons/`        | Extension icons (16/48/128).                              |

## Configuration

- To change the matched comment text, edit `TARGET_TEXT` in `content.js` and
  reload the extension (`browser://extensions` → reload button). Curly/typographic
  quotes (“, ”, «, ») are treated the same as straight quotes, so either form works.
- To count/highlight a different set of records, change `RECORD_SELECTOR` in
  `content.js`.
- To change the header the badge is appended to, change `HEADER_SELECTOR`.
- The badge style (colors, padding) is set in `getBadge()` in `content.js`.
- The highlight class and the rows it is applied to are `HIGHLIGHT_CLASS` and
  `RECORD_ROW_SELECTOR` in `content.js`.
