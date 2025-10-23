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

  preview.querySelectorAll("p, div, td, th, li, span").forEach((el) => {
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

  // --- 2) Snapshot styles/classes with a SAFE whitelist ---
  // Root cause fix: do not blindly restore styles by index across tag types.
  // Instead, store only allowed properties and reapply only when tag matches.
  const SAFE_SELECTOR = "td, th, p, span, div, ul, ol, li";
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
    // Overwrite only the allowed props
    for (const [k, v] of Object.entries(allowedObj)) {
      existingObj[k] = v;
    }
    const result = objToStyleString(existingObj);
    return result ? result + ";" : ""; // keep trailing semicolon for consistency
  };

  const snapshot = [];
  preview.querySelectorAll(SAFE_SELECTOR).forEach((el) => {
    const tag = el.tagName; // uppercase
    const styleObj = styleStringToObj(el.getAttribute("style") || "");
    const inTable = !!el.closest("table");
    const allowed =
      tag === "TD" || tag === "TH" ? TABLE_CELL_ALLOWED : NON_TABLE_ALLOWED;
    const filtered = filterStyle(styleObj, allowed);

    snapshot.push({
      tag, // guard against cross-tag application
      allowedStyle: filtered, // only safe props
      classes: el.className || "", // preserve classes
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

    // Restore only if the tagName matches (prevents table-cell -> paragraph bleed)
    if (original.tag === el.tagName) {
      // Merge only the allowed properties for the current context
      const isCell = el.tagName === "TD" || el.tagName === "TH";
      const allowedSet = isCell ? TABLE_CELL_ALLOWED : NON_TABLE_ALLOWED;
      const mergedStyle = mergeAllowed(
        el.getAttribute("style") || "",
        filterStyle(original.allowedStyle, allowedSet)
      );
      if (mergedStyle) el.setAttribute("style", mergedStyle);

      // Restore classes
      if (original.classes) el.className = original.classes;
    }
  });

  // --- 6) Apply table attributes and borders (scoped to tables only) ---
  preview.querySelectorAll("table").forEach((table) => {
    table.setAttribute("role", "presentation");
    table.setAttribute("cellpadding", "0");
    table.setAttribute("cellspacing", "0");
    table.style.borderCollapse = "collapse";
    table.style.border = "1px solid #000000"; // table border only
  });

  // --- 7) Cell styling + selection handlers (no bleed to non-table tags) ---
  // Clear old selection references (they point to old nodes)
  selectedCells.forEach((c) => c.classList.remove("selected"));
  selectedCells.clear();

  preview.querySelectorAll("td, th").forEach((cell) => {
    // Ensure borders/padding only for cells
    cell.style.border = "1px solid #000000";
    cell.style.padding = "10px";

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

  preview.querySelectorAll("p, span, div, ul, ol, li").forEach((el) => {
    // Skip elements inside tables entirely
    if (el.closest("table")) return;

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
  const cleanedHtml = stripFigureWrapper(rawHtml);

  const temp = document.createElement("div");
  temp.innerHTML = cleanedHtml;

  const fontSize = document.getElementById("fontSize").value + "pt";
  const isForEmail = document.getElementById("forEmail").checked;
  const paddingTop = document.getElementById("paddingTop").value + "px";
  const paddingBottom = document.getElementById("paddingBottom").value + "px";

  // ✅ Fonts: only set if not already present
  temp.querySelectorAll("p, td, th, li, div, span").forEach((el) => {
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
    if (!list.style.whiteSpace) list.style.whiteSpace = "normal";
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
  });

  // ✅ Convert RGB to HEX in inline styles
  temp.querySelectorAll("[style]").forEach((el) => {
    el.setAttribute("style", convertRgbToHex(el.getAttribute("style")));
  });

  // ✅ Remove preview-only classes
  temp.querySelectorAll("hr.hr-preview").forEach((hr) => {
    hr.removeAttribute("class");
  });

  let finalHtml = temp.innerHTML;

  // ✅ Wrap for email if needed
  if (isForEmail) {
    finalHtml = `
      <div style="margin: 0px; line-height:24px; padding: 40px 30px; font-size: ${fontSize}; font-family: ${selectedFont}; color: #000000;">
        ${finalHtml}
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

function stripFigureWrapper(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  temp.querySelectorAll("figure.table").forEach((figure) => {
    const table = figure.querySelector("table");
    if (table) figure.replaceWith(table);
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
