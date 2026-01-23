

# HTML & Email Template Generator

This is a client-side web application designed to create clean, cross-client compatible HTML content, particularly optimized for use in email. It utilizes the CKEditor 5 rich-text editor for content creation and includes custom JavaScript logic for styling, language-specific font application, and advanced table cell styling.

## ✨ Features

  * **Rich Text Editing:** Uses Toolbar 5 for a robust editing experience (Bold, Italic, Lists, Links, Tables).
  * **Email Optimization:** Optional wrapper adds email-safe styles (e.g., `line-height`, `margin`) to the output HTML.
  * **Language-Specific Fonts:** Automatically applies the most compatible font for selected languages:
      * **English:** 'Segoe UI'
      * **Japanese:** 'Yu Gothic'
      * **Korean:** 'Malgun Gothic'
  * **Table Cell Styling:** Enables individual or multiple cell selection (`Ctrl/Cmd/Shift + Click`) in the live preview to apply specific styles:
      * Font Size & Color
      * Background Color
      * Padding
      * Text Alignment
  * **Automatic Cleanup:**
]      * Converts all inline `rgb()` color declarations to **HEX** values for better email client compatibility.
      * Formats and indents the final HTML output for readability.
  * **One-Click Copy:** Easily copy the finalized HTML code to the clipboard.

## ⚙️ How It Works (Technical Overview)

The application flow is centered around three main components: the **CKEditor instance**, the **Live Preview**, and the **HTML Output**.

1.  **`updateLivePreview()`:** Triggered on any content change, this function:
      * Copies the raw HTML from the editor to the `#livePreview` element.
      * Applies universal email table attributes (`cellpadding="0"`, `cellspacing="0"`, `border-collapse: collapse`).
      * Attaches the custom cell selection logic and styling events to all `<td>` and `<th>` elements.
      * Calls `applyLanguageFont()` to immediately style the content in the preview.
2. **`applyCellStyle()` / `applyLanguageFont()`:** These functions apply selected styles to the `selectedCells` set in the preview, ensuring all styles are visible before final output.
3.  **`updateHtmlOutput()`:** This is the final processing step:
      * It creates a temporary DOM element to ensure all inline styles (font family, size, colors) are correctly applied to every content element (`<p>`, `<td>`, `<span>`, etc.).
      * It converts all RGB colors to HEX using `convertRgbToHex()`.
      * It removes the `<figure>` tag using `stripFigureWrapper()`.
      * It optionally wraps the entire content in the main email `<div>` if the "For Email" checkbox is selected.
      * The `formatHtml()` function then cleanly indents the final markup before displaying it in the code block.

## 🛠️ Customization & Extensibility

### Font Mapping

To add support for a new language/font combination, simply update the `fontMap` object:

```javascript
const fontMap = {
  en: "'Segoe UI'",
  ja: "'Yu Gothic'",
  ko: "'Malgun Gothic'",
  // Example for Chinese
  zh: "'Microsoft YaHei'", 
};
```

### New Element Styling

If you add new elements to the editor (e.g., headings like `<h1>` or `<h2>`), you should update the query selectors in both `applyLanguageFont()` and `updateHtmlOutput()` to ensure they receive the correct language font and size styles:

**In `applyLanguageFont()` (and `applyCellStyle()`):**

```javascript
// Add h1, h2, etc., to the list
preview.querySelectorAll("p, div, td, th, ul, ol, li, h1, h2").forEach((el) => {
    // ... styling logic ...
});
```

### Table Border Style

The universal table border is currently set to `1px solid #000000`. You can easily adjust this in the `updateLivePreview()` function:

```javascript
preview.querySelectorAll("table").forEach((table) => {
    // ...
    table.style.border = "1px solid #cccccc"; // Example: Lighter gray border
    // ...
});
```
