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

function applyLanguageFont() {
  const selectedLang = document.getElementById("languageSelector").value;
  const selectedFont = fontMap[selectedLang] || fontMap["en"];
  const fontSize = document.getElementById("fontSize").value + "pt"; // ✅ define fontSize
  const preview = document.getElementById("livePreview");

  preview.querySelectorAll("p, div, td, th, ul, ol, li").forEach((el) => {
    el.style.fontFamily = selectedFont;
    const isForEmail = document.getElementById("forEmail").checked;
    if (!isForEmail) {
      el.style.fontSize = fontSize;
    }
  });

  updateHtmlOutput(selectedFont);
}

function updateLivePreview() {
  const content = editorInstance.getData();
  const preview = document.getElementById("livePreview");

  // ✅ Preserve custom elements (like <hr>) before replacing content
  const existingCustomElements = [];
  preview.querySelectorAll("hr").forEach((hr) => {
    const index = [...preview.childNodes].indexOf(hr);
    existingCustomElements.push({ element: hr.cloneNode(true), index });
  });

  // ✅ Replace preview content with updated editor content
  preview.innerHTML = content.trim();

  // ✅ Re-insert preserved custom elements at their original positions
  existingCustomElements.forEach(({ element, index }) => {
    if (index >= preview.childNodes.length) {
      preview.appendChild(element);
    } else {
      preview.insertBefore(element, preview.childNodes[index]);
    }
  });

  // ✅ Apply table attributes and border logic
  preview.querySelectorAll("table").forEach((table) => {
    table.setAttribute("role", "presentation");
    table.setAttribute("cellpadding", "0");
    table.setAttribute("cellspacing", "0");
    table.style.borderCollapse = "collapse";

    if (!table.classList.contains("list-table")) {
      // Normal tables: add borders
      table.querySelectorAll("td, th").forEach((cell) => {
        cell.style.border = "1px solid #000000";
        cell.style.padding = "10px";
      });
    } else {
      // List tables: keep borderless
      table.querySelectorAll("td, th").forEach((cell) => {
        cell.style.border = "none";
        cell.style.padding = "0";
      });
    }
  });

  // ✅ Clear stale selections after re-render
  selectedCells.forEach((c) => c.classList.remove("selected"));
  selectedCells.clear();
  selectedNonTableElements.forEach((e) =>
    e.classList.remove("selected-non-table")
  );
  selectedNonTableElements.clear();

  // ✅ Attach delegated click handler only once
  if (!preview.__delegatedHandlersAttached) {
    preview.__delegatedHandlersAttached = true;

    preview.addEventListener("click", (event) => {
      const target = event.target;

      // Table cell selection
      const cell = target.closest("td, th");
      if (cell) {
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
        event.stopPropagation();
        return;
      }

      // Non-table element selection
      const el = target.closest("p, span, div, ul, ol, li");
      if (el && !el.closest("table")) {
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
        event.stopPropagation();
      }
    });
  }

  // ✅ Apply language font after update
  applyLanguageFont();
}

function updateHtmlOutput(selectedFont = fontMap["en"]) {
  const preview = document.getElementById("livePreview");
  const rawHtml = preview.innerHTML.trim();
  const cleanedHtml = stripFigureWrapper(rawHtml);

  const temp = document.createElement("div");
  temp.innerHTML = cleanedHtml;

  // ✅ Convert lists (ul/ol) into table-based lists per your sample
  convertListsToTables(temp);

  const fontSize = document.getElementById("fontSize").value + "pt";
  const isForEmail = document.getElementById("forEmail").checked;

  // Apply font styles to all relevant elements
  temp.querySelectorAll("p, td, th, ul, ol, li, div, span").forEach((el) => {
    el.style.fontFamily = selectedFont;
  });

  // Style links
  temp.querySelectorAll("a").forEach((link) => {
    link.style.textDecoration = "underline";
    link.style.color = "#0067b8";
    link.setAttribute("target", "_blank");
  });

  // Convert RGB to HEX in inline styles
  temp.querySelectorAll("[style]").forEach((el) => {
    el.setAttribute("style", convertRgbToHex(el.getAttribute("style")));
  });

  // Remove preview-only classes
  temp.querySelectorAll("hr.hr-preview").forEach((hr) => {
    hr.removeAttribute("class");
  });

  let finalHtml = temp.innerHTML;

  if (isForEmail) {
    finalHtml = `
      <div style="margin: 0px; line-height:24px; padding: 40px 30px; font-size: ${fontSize}; font-family: ${selectedFont}; color: #000000;">
        ${finalHtml}
      </div>
    `;
  }

  let formattedHtml = formatHtml(finalHtml).replace(/&quot;/g, "'");

  const removable = ["<", ">", '"', "'"];
  if (removable.includes(formattedHtml.charAt(0))) {
    formattedHtml = formattedHtml.substring(1);
  }
  if (removable.includes(formattedHtml.charAt(formattedHtml.length - 1))) {
    formattedHtml = formattedHtml.substring(0, formattedHtml.length - 1);
  }

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

  // ✅ Apply styles to selected table cells
  if (selectedCells.size > 0) {
    selectedCells.forEach((cell) => {
      const row = cell.parentElement;
      const table = row?.closest("table");
      const isListTable =
        table && table.getAttribute("data-list-table") === "1";

      const targetCells = isListTable ? row.querySelectorAll("td, th") : [cell];

      targetCells.forEach((c) => {
        c.style.fontSize = fontSize;
        c.style.color = textColor; // <-- text color
        c.style.backgroundColor = bgColor;
        c.style.paddingTop = paddingTop;
        c.style.paddingBottom = paddingBottom;
        c.style.textAlign = textAlign;
        c.style.fontFamily = selectedFont;
      });
    });
  }

  // Apply styles to selected non-table elements
  if (selectedNonTableElements.size > 0) {
    selectedNonTableElements.forEach((el) => {
      el.style.fontSize = fontSize;
      el.style.color = textColor;
      el.style.marginTop = paddingTop; // Your margin-based spacing for non-table
      el.style.marginBottom = paddingBottom;
      el.style.padding = "0"; // Force padding to zero
      el.style.textAlign = textAlign;
      el.style.fontFamily = selectedFont;
    });
  }

  updateHtmlOutput(selectedFont);
}

function clearCellStyle() {
  const preview = document.getElementById("livePreview");
  const selectedLang = document.getElementById("languageSelector").value;
  const selectedFont = fontMap[selectedLang] || fontMap["en"];

  // Remove styles from selected table cells but keep font-size
  if (selectedCells.size > 0) {
    selectedCells.forEach((cell) => {
      const currentFontSize =
        cell.style.fontSize || window.getComputedStyle(cell).fontSize;
      cell.removeAttribute("style");
      if (currentFontSize) {
        cell.style.fontSize = currentFontSize; // Reapply font-size
      }
    });
    selectedCells.clear();
  }

  // Remove styles from selected non-table elements but keep font-size
  if (selectedNonTableElements.size > 0) {
    selectedNonTableElements.forEach((el) => {
      const currentFontSize =
        el.style.fontSize || window.getComputedStyle(el).fontSize;
      el.removeAttribute("style");
      if (currentFontSize) {
        el.style.fontSize = currentFontSize; // Reapply font-size
      }
      el.classList.remove("selected-non-table");
    });
    selectedNonTableElements.clear();
  }

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

/**
 * Converts all <ul> and <ol> lists under `root` into a table-based list format.
 * - Unordered lists => bullet "•"
 * - Ordered lists => numeric "1.", "2.", ... (respects `start` attribute if present)
 * - Nested lists inside an <li> are flattened and appended to the same cell using <br/>
 * - All styles are inline and set to zero margins/padding, per your sample
 *
 * Example call inside updateHtmlOutput, after `temp.innerHTML = cleanedHtml`:
 *   convertListsToTables(temp);
 */
function convertListsToTables(root) {
  if (!root) return;
  const lists = Array.from(root.querySelectorAll("ul, ol"));

  lists.forEach((list) => {
    const isOrdered = list.tagName === "OL";
    const startAttr = list.getAttribute("start");
    const startIndex =
      isOrdered && startAttr ? parseInt(startAttr, 10) || 1 : 1;

    const table = document.createElement("table");

    // Set proper attributes
    table.setAttribute("role", "presentation");
    table.setAttribute("border", "0");
    table.setAttribute("cellspacing", "0");
    table.setAttribute("cellpadding", "0");

    // Apply only CSS inside style
    table.style.margin = "0";
    table.style.padding = "0";
    table.style.borderCollapse = "collapse";

    const liItems = Array.from(list.children).filter(
      (el) => el.tagName === "LI"
    );

    liItems.forEach((li, idx) => {
      const tr = document.createElement("tr");

      const markerTd = document.createElement("td");
      markerTd.setAttribute(
        "style",
        "margin: 0; padding: 0; width: 20px; vertical-align: top; text-align: left;"
      );
      markerTd.textContent = isOrdered ? startIndex + idx + "." : "•";

      const textTd = document.createElement("td");
      textTd.setAttribute("style", "vertical-align: top;");

      // ✅ Transfer inline styles from <li> to textTd
      if (li.getAttribute("style")) {
        textTd.setAttribute(
          "style",
          textTd.getAttribute("style") + " " + li.getAttribute("style")
        );
      }

      const liClone = li.cloneNode(true);
      const nestedTexts = [];
      liClone.querySelectorAll("ul, ol").forEach((nested) => {
        nested.querySelectorAll("li").forEach((nli) => {
          const t = (nli.textContent || "").trim();
          if (t) nestedTexts.push(t);
        });
        nested.remove();
      });

      const mainHtml = (liClone.innerHTML || "").trim();
      textTd.innerHTML = mainHtml ? mainHtml : "&nbsp;";
      if (nestedTexts.length) {
        textTd.innerHTML += "<br/>" + nestedTexts.join("<br/>");
      }

      tr.appendChild(markerTd);
      tr.appendChild(textTd);
      table.appendChild(tr);
    });

    list.replaceWith(table);
  });
}

function convertListToTable(listElement) {
  const table = document.createElement("table");
  table.classList.add("list-table"); // Marker class for list-based tables

  const items = listElement.querySelectorAll("li");
  items.forEach((item) => {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.textContent = item.textContent.trim();
    cell.style.border = "none"; // Lock border for list tables
    row.appendChild(cell);
    table.appendChild(row);
  });

  return table;
}
