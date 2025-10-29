let editorInstance;
let selectedCells = new Set(); // This will store the selected cells
let selectedNonTableElements = new Set(); // Store multiple non-table elements

const fontMap = {
  en: "'Segoe UI', Arial, sans-serif",
  ja: "'Yu Gothic', sans-serif",
  ko: "'Malgun Gothic', sans-serif",
};

ClassicEditor.create(document.querySelector("#editor"), {
  toolbar: [
    "bold",
    "italic",
    "|",
    "link",
    "bulletedList",
    "numberedList",
    "insertTable",
    "|",
    "undo",
    "redo",
  ],
  placeholder: "Paste content here...",
})
  .then((editor) => {
    editorInstance = editor;
    editor.model.document.on("change:data", () => updateLivePreview());
    enableHrRemoval(); // Attach delegated listener
  })
  .catch((error) => console.error(error));

function renderOutput() {
  applyLanguageFont();
}

function applyLanguageFont(options = {}) {
  const { applySize = false } = options; // 🔒 default: don't apply font-size
  const selectedLang = document.getElementById("languageSelector").value;
  const selectedFont = fontMap[selectedLang] || fontMap["en"];
  const fontSize = document.getElementById("fontSize").value + "pt";
  const preview = document.getElementById("livePreview");
  const isForEmail = document.getElementById("forEmail").checked;

  preview.querySelectorAll("p, td, th, li, span").forEach((el) => {
    // Always set font-family (safe, per your spec)
    el.style.fontFamily = selectedFont;

    // 🛑 Only set font-size if explicitly enabled AND not for email wrapper
    if (applySize && !isForEmail) {
      // Respect existing inline sizes: set only if missing
      if (!el.style.fontSize) el.style.fontSize = fontSize;
    }
  });

  updateHtmlOutput(selectedFont);
}

function updateLivePreview() {
  const preview = document.getElementById("livePreview");
  const content = editorInstance.getData();

  // --- 1) Preserve custom <hr> elements (top-level) ---
  const preservedHrs = [];
  preview.querySelectorAll("hr").forEach((hr) => {
    const idx = Array.prototype.indexOf.call(preview.childNodes, hr);
    preservedHrs.push({ node: hr.cloneNode(true), index: idx });
  });

  // Capture per-table column widths by document order (robust to CKEditor rewrites)
  const savedTablePercents = Array.from(preview.querySelectorAll("table")).map(
    (t) => {
      // Use the merged-aware reader if available; otherwise fall back to simple reader
      const perc =
        typeof readColumnPercentsMerged === "function"
          ? readColumnPercentsMerged(t)
          : readColumnPercents(t, getSimpleColumnCount(t)) || [];
      return { colCount: perc.length, percents: perc };
    }
  );

  // --- 2) Snapshot styles/classes with a SAFE whitelist ---
  const SAFE_SELECTOR = "td, th, p, span, ul, ol, li";
  const NON_TABLE_ALLOWED = new Set([
    "font-family",
    "font-size",
    "color",
    "text-align",
    "line-height",
    "margin-top",
    "margin-bottom",
  ]);
  const TABLE_CELL_ALLOWED = new Set([
    "font-family",
    "font-size",
    "color",
    "text-align",
    "line-height",
    "background-color",
    "padding",
    "padding-top",
    "padding-bottom",
    "padding-left",
    "padding-right",
    "border",
    "border-top",
    "border-bottom",
    "border-left",
    "border-right",
  ]);

  const styleStringToObj = (styleStr = "") => {
    const obj = {};
    styleStr
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((decl) => {
        const colon = decl.indexOf(":");
        if (colon > 0) {
          const prop = decl.slice(0, colon).trim().toLowerCase();
          const val = decl.slice(colon + 1).trim();
          obj[prop] = val;
        }
      });
    return obj;
  };

  const objToStyleString = (obj) =>
    Object.entries(obj)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");

  const filterStyle = (styleObj, allowedSet) => {
    const filtered = {};
    for (const prop of Object.keys(styleObj)) {
      if (allowedSet.has(prop)) filtered[prop] = styleObj[prop];
    }
    return filtered;
  };

  const mergeAllowed = (existingStr, allowedObj) => {
    const existingObj = styleStringToObj(existingStr);
    for (const [k, v] of Object.entries(allowedObj)) {
      existingObj[k] = v;
    }
    const result = objToStyleString(existingObj);
    return result ? result + ";" : "";
  };

  const snapshot = [];
  preview.querySelectorAll(SAFE_SELECTOR).forEach((el) => {
    const tag = el.tagName;
    const styleObj = styleStringToObj(el.getAttribute("style") || "");
    const allowed =
      tag === "TD" || tag === "TH" ? TABLE_CELL_ALLOWED : NON_TABLE_ALLOWED;
    const filtered = filterStyle(styleObj, allowed);

    snapshot.push({
      tag,
      allowedStyle: filtered,
      classes: el.className || "",
    });
  });

  // --- 3) Replace preview content with editor HTML ---
  preview.innerHTML = (content || "").trim();

  // --- 4) Reinsert preserved <hr> at prior positions (best effort) ---
  preservedHrs.forEach(({ node, index }) => {
    const cappedIndex = Math.min(index, preview.childNodes.length);
    const ref = preview.childNodes[cappedIndex] || null;
    preview.insertBefore(node, ref);
  });

  // --- 5) Restore styles/classes SAFELY (tag-matched + whitelist) ---
  const newElements = preview.querySelectorAll(SAFE_SELECTOR);
  newElements.forEach((el, i) => {
    const original = snapshot[i];
    if (!original) return;

    if (original.tag === el.tagName) {
      const isCell = el.tagName === "TD" || el.tagName === "TH";
      const allowedSet = isCell ? TABLE_CELL_ALLOWED : NON_TABLE_ALLOWED;
      const mergedStyle = mergeAllowed(
        el.getAttribute("style") || "",
        filterStyle(original.allowedStyle, allowedSet)
      );
      if (mergedStyle) el.setAttribute("style", mergedStyle);

      if (original.classes) el.className = original.classes;
    }
  });

  // Re-apply saved widths to each table in order; if mismatch, normalize fresh
  const tablesNow = Array.from(preview.querySelectorAll("table"));
  tablesNow.forEach((table, i) => {
    const saved = savedTablePercents[i];
    if (saved && saved.colCount > 0) {
      // Apply the exact previous column model (merged-cell aware)
      if (typeof applyColumnPercentsMerged === "function") {
        applyColumnPercentsMerged(table, saved.percents);
      } else {
        // Simple fallback if you haven't added merged-aware helpers
        applyColumnPercents(table, saved.percents);
      }
    } else {
      // No prior widths: normalize to 100% now
      if (typeof ensureTablePercentWidthsMerged === "function") {
        ensureTablePercentWidthsMerged(table);
      } else {
        ensureTablePercentWidths(table);
      }
    }
  });

  // --- 6) Table attributes, borders, width normalization & resizers ---
  preview.querySelectorAll("table").forEach((table) => {
    table.setAttribute("role", "presentation");
    table.setAttribute("cellpadding", "0");
    table.setAttribute("cellspacing", "0");
    table.style.borderCollapse = "collapse";
    table.style.border = "1px solid #000000"; // table border only
  });

  // Wrap tables and add wrapper-based, percent-aligned resizers
  enableColumnResize(preview);

  // --- 7) Cell styling + selection handlers (no bleed to non-table tags) ---
  selectedCells.forEach((c) => c.classList.remove("selected"));
  selectedCells.clear();

  const paddingTop = document.getElementById("paddingTop").value + "px";
  const paddingBottom = document.getElementById("paddingBottom").value + "px";
  const paddingLeft = document.getElementById("paddingLeft").value + "px";
  const paddingRight = document.getElementById("paddingRight").value + "px";

  preview.querySelectorAll("td, th").forEach((cell) => {
    cell.style.border = "1px solid #000000";
    cell.style.paddingTop = paddingTop;
    cell.style.paddingBottom = paddingBottom;
    cell.style.paddingLeft = paddingLeft;
    cell.style.paddingRight = paddingRight;

    cell.onclick = (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        cell.classList.toggle("selected");
        if (cell.classList.contains("selected")) {
          selectedCells.add(cell);
        } else {
          selectedCells.delete(cell);
        }
      } else {
        selectedCells.forEach((c) => c.classList.remove("selected"));
        selectedCells.clear();
        cell.classList.add("selected");
        selectedCells.add(cell);
      }
    };
  });

  // --- 8) Non-table element selection handlers ---
  selectedNonTableElements.forEach((e) =>
    e.classList.remove("selected-non-table")
  );
  selectedNonTableElements.clear();

  preview.querySelectorAll("p, span, ul, ol, li").forEach((el) => {
    if (el.closest("table")) return; // skip elements inside tables

    el.onclick = (event) => {
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        el.classList.toggle("selected-non-table");
        if (el.classList.contains("selected-non-table")) {
          selectedNonTableElements.add(el);
        } else {
          selectedNonTableElements.delete(el);
        }
      } else {
        selectedNonTableElements.forEach((e) =>
          e.classList.remove("selected-non-table")
        );
        selectedNonTableElements.clear();
        el.classList.add("selected-non-table");
        selectedNonTableElements.add(el);
      }
    };
  });

  // --- 9) Reapply font-family only (no automatic font-size on editor changes) ---
  applyLanguageFont({ applySize: false });
}

function updateHtmlOutput(selectedFont = fontMap["en"]) {
  const preview = document.getElementById("livePreview");
  const rawHtml = preview.innerHTML.trim();
  const cleanedHtml = stripPreviewWrappers(rawHtml);

  const temp = document.createElement("div");
  temp.innerHTML = cleanedHtml;

  const fontSize = document.getElementById("fontSize").value + "pt";
  const isForEmail = document.getElementById("forEmail").checked;
  const paddingTop = document.getElementById("paddingTop").value + "px";
  const paddingBottom = document.getElementById("paddingBottom").value + "px";
  const paddingLeft = document.getElementById("paddingLeft").value + "px";
  const paddingRight = document.getElementById("paddingRight").value + "px";

  // ✅ Fonts: only set if not already present
  temp.querySelectorAll("p, td, th, li, span").forEach((el) => {
    if (!el.style.fontFamily) el.style.fontFamily = selectedFont;
    if (!el.style.fontSize) el.style.fontSize = fontSize;
  });

  // ✅ Links: only set if missing
  temp.querySelectorAll("a").forEach((link) => {
    if (!link.style.textDecoration) link.style.textDecoration = "underline";
    if (!link.style.color) link.style.color = "#0067b8";
    link.setAttribute("target", "_blank");
  });

  // ✅ Lists: only set if missing
  temp.querySelectorAll("ul, ol").forEach((list) => {
    if (!list.style.marginTop) list.style.marginTop = "0px";
  });

  // ✅ List items: only set if missing
  temp.querySelectorAll("li").forEach((li) => {
    if (!li.style.fontSize) li.style.fontSize = fontSize;
    if (!li.style.fontFamily) li.style.fontFamily = selectedFont;
  });

  // ✅ Paragraph margins: only set if missing
  temp.querySelectorAll("p").forEach((p) => {
    if (!p.style.marginTop) p.style.marginTop = paddingTop;
    if (!p.style.marginBottom) p.style.marginBottom = paddingBottom;
    // Optional: default wrapping if missing on <p>
    if (!p.style.whiteSpace) p.style.whiteSpace = "normal";
  });

  // ✅ Convert RGB to HEX in inline styles
  temp.querySelectorAll("[style]").forEach((el) => {
    el.setAttribute("style", convertRgbToHex(el.getAttribute("style")));
  });

  // ✅ Remove preview-only classes
  temp.querySelectorAll("hr.hr-preview").forEach((hr) => {
    hr.removeAttribute("class");
  });

  // Build inner HTML
  let innerHtml = temp.innerHTML;

  // ✅ Wrap for email or non-email with white-space: normal
  let finalHtml;
  if (isForEmail) {
    // Email-friendly outer wrapper retains padding & typography, now includes white-space
    finalHtml = `
      <div style="margin: 0px; line-height:24px; padding: 40px 30px; font-size: ${fontSize}; font-family: ${selectedFont}; color: #000000; white-space: normal;">
        ${innerHtml}
      </div>
    `;
  } else {
    // Non-email: minimal wrapper that enforces normal wrapping inline
    finalHtml = `
      <div style="white-space: normal;">
        ${innerHtml}
      </div>
    `;
  }

  // ✅ Format and clean up HTML
  let formattedHtml = formatHtml(finalHtml).replace(/&quot;/g, "'");
  const removable = ["<", ">", '"', "'"];
  if (removable.includes(formattedHtml.charAt(0))) {
    formattedHtml = formattedHtml.substring(1);
  }
  if (removable.includes(formattedHtml.charAt(formattedHtml.length - 1))) {
    formattedHtml = formattedHtml.substring(0, formattedHtml.length - 1);
  }

  // ✅ Output to code block
  const codeBlock = document.getElementById("htmlCodeBlock");
  codeBlock.textContent = formattedHtml;
  Prism.highlightElement(codeBlock);

  // ✅ Ensure <td>/<th> carry width attribute mirroring inline percent (helps Outlook)
  // ✅ Ensure <td>/<th> have merged-aware widths for email output
  if (isForEmail) {
    Array.from(temp.querySelectorAll("table")).forEach((table) => {
      const { colCount } = computeTableStructure(table);
      if (colCount <= 0) return;

      // Read current columns (from any row), normalize, and re-apply
      const percents = readColumnPercentsMerged(table);
      applyColumnPercentsMerged(table, percents);

      table.style.width = "100%";
      table.setAttribute("width", "100%");
    });
  }
}

// New function to insert <hr> tag
function insertDivider() {
  const preview = document.getElementById("livePreview");
  const hrElement = document.createElement("hr");

  // Add a preview-specific class for styling (optional)
  hrElement.classList.add("hr-preview");

  // Append the <hr> to the preview container
  preview.appendChild(hrElement);

  // Update the HTML output after adding the divider
  const selectedLang = document.getElementById("languageSelector").value;
  const selectedFont = fontMap[selectedLang] || fontMap["en"];
  updateHtmlOutput(selectedFont);
}

function enableHrRemoval() {
  const preview = document.getElementById("livePreview");

  // Attach ONE listener to the container
  preview.addEventListener("click", (event) => {
    if (event.target.tagName === "HR") {
      event.target.remove(); // Remove clicked <hr>

      const selectedLang = document.getElementById("languageSelector").value;
      const selectedFont = fontMap[selectedLang] || fontMap["en"];
      updateHtmlOutput(selectedFont); // Update HTML after removal
    }
  });
}

function convertRgbToHex(styleString) {
  return styleString.replace(
    /rgb\((\d+),\s*(\d+),\s*(\d+)\)/gi,
    (_, r, g, b) => {
      return (
        "#" +
        [r, g, b]
          .map((x) => {
            const hex = parseInt(x).toString(16);
            return hex.length === 1 ? "0" + hex : hex;
          })
          .join("")
      );
    }
  );
}

function applyCellStyle() {
  const fontSize = document.getElementById("fontSize").value + "pt";
  const textColor = document.getElementById("textColor").value;
  const bgColor = document.getElementById("bgColor").value;

  const paddingTop = document.getElementById("paddingTop").value + "px";
  const paddingBottom = document.getElementById("paddingBottom").value + "px";
  const paddingLeft = document.getElementById("paddingLeft").value + "px";
  const paddingRight = document.getElementById("paddingRight").value + "px";

  const textAlign = document.getElementById("textAlign").value;
  const selectedLang = document.getElementById("languageSelector").value;
  const selectedFont = fontMap[selectedLang] || fontMap["en"];

  const preview = document.getElementById("livePreview");

  // Apply styles to selected table cells (only if margin is 0)
  if (selectedCells.size > 0) {
    selectedCells.forEach((cell) => {
      if (getComputedStyle(cell).margin === "0px") {
        cell.style.fontSize = fontSize;
        cell.style.color = textColor;
        cell.style.backgroundColor = bgColor;
        cell.style.paddingTop = paddingTop;
        cell.style.paddingBottom = paddingBottom;
        cell.style.paddingLeft = paddingLeft;
        cell.style.paddingRight = paddingRight;
        cell.style.textAlign = textAlign;
        cell.style.fontFamily = selectedFont;
      }
    });
  }

  // Apply styles to selected non-table elements (use margin, reset padding)
  if (selectedNonTableElements.size > 0) {
    selectedNonTableElements.forEach((el) => {
      el.style.fontSize = fontSize;
      el.style.color = textColor;
      el.style.marginTop = paddingTop; // Use margin instead
      el.style.marginBottom = paddingBottom;
      el.style.marginLeft = paddingLeft;
      el.style.padding = "0"; // Force padding to zero
      el.style.textAlign = textAlign;
      el.style.fontFamily = selectedFont;
    });
  }

  updateHtmlOutput(selectedFont);
}

function clearCellStyle() {
  const selectedLang = document.getElementById("languageSelector").value;
  const selectedFont = fontMap[selectedLang] || fontMap["en"];

  const defaultFontSize = "13.5pt";
  const defaultTextColor = "#000000";
  const defaultBorder = "1px solid #000000";
  const defaultBackgroundColor = "#FFFFFF";

  // Reset table cells
  selectedCells.forEach((cell) => {
    cell.style.fontFamily = selectedFont;
    cell.style.fontSize = defaultFontSize;
    cell.style.color = defaultTextColor;
    cell.style.border = defaultBorder;
    cell.style.backgroundColor = defaultBackgroundColor;
    cell.style.padding = "10px";
    cell.style.textAlign = "left";
  });
  selectedCells.clear();

  // Reset non-table elements
  selectedNonTableElements.forEach((el) => {
    el.style.fontFamily = selectedFont;
    el.style.fontSize = defaultFontSize;
    el.style.color = defaultTextColor;
    el.style.marginTop = "0";
    el.style.marginBottom = "0";
    el.style.padding = "0";
    el.style.textAlign = "left";
  });
  selectedNonTableElements.clear();

  updateHtmlOutput(selectedFont);
}

function copyHTML() {
  const content = document.getElementById("htmlCodeBlock").textContent.trim();

  const successCopy = document.getElementById("successCopy");
  const failedCopy = document.getElementById("failedCopy");

  // If there's no content, show the failed copy message
  if (!content) {
    failedCopy.classList.add("show");
    successCopy.classList.remove("show"); // Hide success message if no content

    setTimeout(() => {
      failedCopy.classList.remove("show"); // Hide failed message after 2 seconds
    }, 2000);

    return; // Exit the function early if there's no content
  }

  // If there is content, attempt to copy to clipboard
  navigator.clipboard
    .writeText(content)
    .then(() => {
      successCopy.classList.add("show"); // Show success message
      failedCopy.classList.remove("show"); // Hide failed message

      setTimeout(() => {
        successCopy.classList.remove("show"); // Hide success message after 2 seconds
      }, 2000);
    })
    .catch((err) => {
      console.error("Error copying text: ", err);
    });
}

function stripPreviewWrappers(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;

  // Remove CKEditor figure wrappers (existing behavior)
  temp.querySelectorAll("figure.table").forEach((figure) => {
    const table = figure.querySelector("table");
    if (table) figure.replaceWith(table);
  });

  // NEW: remove preview-only wrappers used for draggable resizers
  temp.querySelectorAll("div.table-resize-wrap").forEach((wrap) => {
    const table = wrap.querySelector("table");
    if (table) wrap.replaceWith(table);
  });

  return temp.innerHTML;
}

function formatHtml(html) {
  const tab = "  "; // Use two spaces for indentation
  let result = "";
  let indent = "";

  html.split(/><(?=\w)/).forEach((element, i) => {
    if (i > 0) result += "\n"; // Add a new line after each tag
    if (element.match(/^\/\w/)) indent = indent.substring(tab.length); // Reduce indentation for closing tags
    result += indent + "<" + element + ">";
    if (element.match(/^<?\w[^>]*[^\/]$/)) indent += tab; // Increase indentation for opening tags
  });

  return result;
}

// Live re-render when the Email checkbox toggles (no CKEditor involved)
document.getElementById("forEmail")?.addEventListener("change", () => {
  const selectedLang = document.getElementById("languageSelector").value;
  const selectedFont = fontMap[selectedLang] || fontMap["en"];
  updateHtmlOutput(selectedFont);
});

// --- Column width helpers: normalize, read, apply ---
function getSimpleColumnCount(table) {
  const firstRow = table.querySelector("tr");
  if (!firstRow) return 0;
  const cells = Array.from(firstRow.children).filter(
    (c) => c.tagName === "TD" || c.tagName === "TH"
  );
  // Simple tables only (no merged cells)
  if (
    cells.some(
      (c) => (c.colSpan && c.colSpan > 1) || (c.rowSpan && c.rowSpan > 1)
    )
  )
    return 0;
  return cells.length;
}

function readColumnPercentsMerged(table) {
  const { colCount, grid } = computeTableStructure(table);
  if (colCount <= 0) return [];

  // Initialize with NaN; we’ll fill from any % widths we can find
  const colPcts = Array(colCount).fill(NaN);

  // Sweep rows: if a cell has % width, distribute evenly across its covered columns
  grid.forEach((rowInfo) => {
    rowInfo.forEach(({ cell, colSpan, startCol }) => {
      const w = (cell.style.width || "").trim();
      if (w.endsWith("%")) {
        const n = parseFloat(w);
        if (Number.isFinite(n)) {
          const perCol = n / colSpan;
          for (let i = 0; i < colSpan; i++) {
            const idx = startCol + i;
            // Only fill unknown columns; first writer wins
            if (!Number.isFinite(colPcts[idx])) colPcts[idx] = perCol;
          }
        }
      }
    });
  });

  // Any still-unknown columns share the remainder equally
  const knownTotal = colPcts.reduce(
    (s, v) => s + (Number.isFinite(v) ? v : 0),
    0
  );
  const unknownIdxs = colPcts
    .map((v, i) => (!Number.isFinite(v) ? i : -1))
    .filter((i) => i >= 0);

  const remaining = Math.max(0, 100 - knownTotal);
  const fill = unknownIdxs.length ? remaining / unknownIdxs.length : 0;
  unknownIdxs.forEach((i) => (colPcts[i] = fill));

  return normalizePercentsTo100(colPcts);
}

function applyColumnPercentsMerged(table, colPercents) {
  const { grid } = computeTableStructure(table);

  table.style.tableLayout = "fixed";
  table.style.width = "100%";

  // For each cell, set width to the sum of its covered columns
  grid.forEach((rowInfo) => {
    rowInfo.forEach(({ cell, colSpan, startCol }) => {
      const spanPct = colPercents
        .slice(startCol, startCol + colSpan)
        .reduce((a, b) => a + b, 0);

      const pctStr = spanPct.toFixed(4) + "%";
      cell.style.width = pctStr;
      // Attribute helps some Outlook engines; harmless elsewhere
      cell.setAttribute("width", spanPct.toFixed(2) + "%");
    });
  });
}

function ensureTablePercentWidthsMerged(table) {
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const { colCount } = computeTableStructure(table);
  if (colCount <= 0) {
    table.setAttribute("data-resize-disabled", "true");
    return null;
  }

  const percents = readColumnPercentsMerged(table);
  applyColumnPercentsMerged(table, percents);
  table.removeAttribute("data-resize-disabled");
  return percents;
}

// --- Wrapper helpers (resizers live on the wrapper for valid/clickable DOM) ---
function wrapTableIfNeeded(table) {
  if (
    table.parentElement &&
    table.parentElement.classList.contains("table-resize-wrap")
  ) {
    return table.parentElement;
  }
  const wrapper = document.createElement("div");
  wrapper.className = "table-resize-wrap";
  wrapper.style.position = "relative";
  wrapper.style.width = "100%";

  table.parentNode.insertBefore(wrapper, table);
  wrapper.appendChild(table);
  return wrapper;
}

function clearExistingResizersOnWrapper(wrapper) {
  wrapper.querySelectorAll(":scope > .col-resizer").forEach((h) => h.remove());
}

// --- Percent-based positioning (exactly on boundaries) ---
function getCurrentPercentsMerged(table) {
  return readColumnPercentsMerged(table);
}

function getWrapperInnerWidth(wrapper) {
  return wrapper.clientWidth;
}

function percentBoundaryToLeftPx(wrapper, cumulativePercent) {
  const w = getWrapperInnerWidth(wrapper);
  return (cumulativePercent / 100) * w;
}

function refreshResizerPositions(wrapper, table) {
  const handles = Array.from(wrapper.querySelectorAll(":scope > .col-resizer"));
  if (!handles.length) return;

  const colPcts = getCurrentPercentsMerged(table);
  if (colPcts.length < 2) return;

  // Compute cumulative boundaries: after each column except the last
  const boundariesPct = [];
  let acc = 0;
  for (let i = 0; i < colPcts.length - 1; i++) {
    acc += colPcts[i];
    boundariesPct.push(acc);
  }

  // Position each handle based on its boundary index
  handles.forEach((h) => {
    const boundaryIdx = parseInt(h.dataset.boundary, 10);
    const pct = boundariesPct[boundaryIdx];
    const leftPx = percentBoundaryToLeftPx(wrapper, pct);
    h.style.left = `${leftPx - 4}px`; // 8px handle centered on boundary
    h.style.top = "0";
    h.style.height = wrapper.clientHeight + "px";
  });
}

// --- Create one grip per internal boundary on the wrapper ---
function makeWrapperHandle(wrapper, table, boundaryIdx) {
  const h = document.createElement("div");
  h.className = "col-resizer";
  h.dataset.boundary = String(boundaryIdx);
  Object.assign(h.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "8px",
    height: wrapper.clientHeight + "px",
    cursor: "col-resize",
    zIndex: "1000",
    background: "transparent",
    userSelect: "none",
  });

  let startX = 0;
  let startPercents = null;
  const minPct = 5; // per-column minimum

  const onMouseMove = (e) => {
    const dx = e.clientX - startX;
    const wrapperW = getWrapperInnerWidth(wrapper);
    const deltaPct = (dx / wrapperW) * 100;

    // Adjust the two adjacent columns around this boundary
    const idx = boundaryIdx;
    const next = startPercents.slice();
    const sumPair = startPercents[idx] + startPercents[idx + 1];

    let newLeft = Math.max(minPct, startPercents[idx] + deltaPct);
    newLeft = Math.min(newLeft, sumPair - minPct);
    const newRight = sumPair - newLeft;

    next[idx] = newLeft;
    next[idx + 1] = newRight;

    applyColumnPercentsMerged(table, next);
    refreshResizerPositions(wrapper, table);
  };

  const onMouseUp = () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);

    // Sync export after resizing
    const selectedLang = document.getElementById("languageSelector").value;
    const selectedFont = fontMap[selectedLang] || fontMap["en"];
    updateHtmlOutput(selectedFont);
  };

  h.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startX = e.clientX;
    startPercents = getCurrentPercentsMerged(table);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  wrapper.appendChild(h);
  return h;
}

// --- One canonical entry point to enable column resize in preview ---
function enableColumnResize(preview) {
  preview.querySelectorAll("table").forEach((table) => {
    const colPercents = ensureTablePercentWidthsMerged(table); // normalize & 100%
    const { colCount, grid } = computeTableStructure(table);

    const wrapper = wrapTableIfNeeded(table);
    clearExistingResizersOnWrapper(wrapper);

    if (colCount > 1 && colPercents) {
      const visible = computeVisibleBoundaries(grid, colCount);
      for (let i = 0; i < colCount - 1; i++) {
        if (visible[i]) {
          makeWrapperHandle(wrapper, table, i);
        }
        // If you prefer to allow dragging even when the boundary is fully covered
        // by row-spanning cells, drop the 'if (visible[i])' and always create.
      }
    }

    // Position grips now and after layout
    refreshResizerPositions(wrapper, table);
    requestAnimationFrame(() => refreshResizerPositions(wrapper, table));

    // Keep aligned on window resize
    const onWinResize = () => refreshResizerPositions(wrapper, table);
    window.addEventListener("resize", onWinResize, { passive: true });
  });
}

// --- Merged-cells aware table structure -------------------------------------
function computeTableStructure(table) {
  // Returns { colCount, grid }
  // grid[rowIndex] = [{ cell, colSpan, rowSpan, startCol, endCol }, ...]
  const rows = Array.from(table.rows);
  let colCount = 0;
  const grid = [];

  // Tracks how many more rows a given column is occupied by a rowspan from above
  let rowSpanLeft = [];

  rows.forEach((row, rIdx) => {
    const rowCells = Array.from(row.cells);
    const rowInfo = [];
    let colIndex = 0;

    // Decrement rowSpanLeft at start of each row to advance rowspan occupancy
    rowSpanLeft = rowSpanLeft.map((v) => Math.max(0, v - 1));

    rowCells.forEach((cell) => {
      // Find next free column index (skip columns still occupied by rowSpan)
      while (rowSpanLeft[colIndex] > 0) colIndex++;

      const cs = Math.max(1, cell.colSpan || 1);
      const rs = Math.max(1, cell.rowSpan || 1);
      const startCol = colIndex;
      const endCol = startCol + cs - 1;

      rowInfo.push({ cell, colSpan: cs, rowSpan: rs, startCol, endCol });

      // Mark columns covered by this cell as occupied for subsequent rows
      if (rs > 1) {
        for (let c = startCol; c <= endCol; c++) {
          rowSpanLeft[c] = (rowSpanLeft[c] || 0) + (rs - 1);
        }
      }

      colIndex += cs;
    });

    grid.push(rowInfo);
    colCount = Math.max(colCount, colIndex);
  });

  return { colCount, grid };
}

// Boundaries that are "visible" (at least one row has a cell ending here)
function computeVisibleBoundaries(grid, colCount) {
  const visible = Array(Math.max(0, colCount - 1)).fill(false);
  grid.forEach((rowInfo) => {
    rowInfo.forEach(({ endCol }) => {
      if (endCol < colCount - 1) visible[endCol] = true;
    });
  });
  return visible;
}

// Normalize an array of numbers to sum to 100 (guarding floats)
function normalizePercentsTo100(pcts) {
  const total = pcts.reduce((a, b) => a + b, 0) || 1;
  const scaled = pcts.map((p) => (p * 100) / total);
  // Final tiny correction so sum === 100.0000
  const diff = 100 - scaled.reduce((a, b) => a + b, 0);
  scaled[scaled.length - 1] += diff;
  return scaled;
}

//Latest Update: October 2025
// Added function to edit the padding, width, and made the is for email checkbox update the preview live.
