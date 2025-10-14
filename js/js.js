let editorInstance;
let selectedCell = null;
let updatingFromEditor = false;
let updatingFromPreview = false;

const fontMap = {
  ja: "'Yu Gothic', sans-serif",
  ko: "'Malgun Gothic', sans-serif",
};

function getFontByLanguage(lang) {
  return fontMap[lang] || "'Segoe UI', Arial, sans-serif";
}

ClassicEditor.create(document.querySelector("#editor"), {
  toolbar: [
    "bold",
    "italic",
    "link",
    "bulletedList",
    "numberedList",
    "insertTable",
    "undo",
    "redo",
  ],
})
  .then((editor) => {
    editorInstance = editor;

    // CKEditor->Preview update
    editor.model.document.on("change:data", () => {
      if (updatingFromPreview) return; // Prevent loop
      updatingFromEditor = true;
      updateLivePreview();
      updatingFromEditor = true;
    });

    editor.editing.view.document.on("paste", (evt, data) => {
      const html = data.dataTransfer.getData("text/html");
      if (html && html.includes("<table")) {
        console.log("Excel table pasted with styles:", html);
      }
    });

    const preview = document.getElementById("livePreview");
    preview.contentEditable = "true";

    // Preview->CKEditor update (debounced)
    preview.addEventListener(
      "input",
      debounce(() => {
        if (updatingFromEditor) return; // Prevent loop
        updatingFromPreview = true;
        // Update CKEditor data from preview content
        editorInstance.setData(preview.innerHTML);
        // Reapply font, output, and cell handlers
        applyLanguageFont();
        updateHtmlOutput();
        bindCellClickHandlers();
        updatingFromPreview = false;
      }, 300)
    );
  })
  .catch(console.error);

function applyLanguageFont() {
  // const selectedLang = document.getElementById("languageSelector").value;
  // const selectedFont = fontMap[selectedLang] || fontMap["en"];

  const selectedLang = document.getElementById("languageSelector").value;
  const selectedFont = getFontByLanguage(selectedLang);

  const preview = document.getElementById("livePreview");

  preview.querySelectorAll("p, td, th, ul, ol, li").forEach((el) => {
    el.style.fontFamily = selectedFont;
    el.style.fontSize = "13.5px";
  });
}

function updateLivePreview() {
  const content = editorInstance.getData();
  const preview = document.getElementById("livePreview");
  preview.innerHTML = content.trim();

  preview.querySelectorAll("table").forEach((table) => {
    table.setAttribute("cellpadding", "0");
    table.setAttribute("cellspacing", "0");
    table.style.border = "1px solid #000";
    table.style.borderCollapse = "collapse";
  });
  preview.querySelectorAll("a").forEach((link) => {
    link.style.textDecoration = "underline";
    link.style.color = "#0067b8";
    link.setAttribute("target", "_blank");
  });

  bindCellClickHandlers();
  applyLanguageFont();
  updateHtmlOutput();
}

function bindCellClickHandlers() {
  const preview = document.getElementById("livePreview");
  preview.querySelectorAll("td, th").forEach((cell) => {
    cell.style.border = cell.style.border || "1px solid #000";
    cell.onclick = () => {
      if (selectedCell) selectedCell.classList.remove("selected");
      selectedCell = cell;
      selectedCell.classList.add("selected");
      syncControlsWithSelectedCell();
    };
  });
}

function syncControlsWithSelectedCell() {
  if (!selectedCell) return;
  const style = window.getComputedStyle(selectedCell);
  document.getElementById("fontSize").value = parseInt(style.fontSize) || 14;
  document.getElementById("textColor").value = rgbToHex(style.color);
  document.getElementById("bgColor").value = rgbToHex(style.backgroundColor);
  document.getElementById("borderColor").value = style.borderColor || "#000000";
  document.getElementById("padding").value = parseInt(style.padding) || 4;
  document.getElementById("textAlign").value = style.textAlign || "left";
  document.getElementById("fontSizeVal").textContent =
    document.getElementById("fontSize").value;
  document.getElementById("paddingVal").textContent =
    document.getElementById("padding").value;
}

function applyCellStyle() {
  if (!selectedCell) {
    alert("Please click on a table cell in the preview.");
    return;
  }
  const fontSize = document.getElementById("fontSize").value;
  const textColor = document.getElementById("textColor").value;
  const bgColor = document.getElementById("bgColor").value;
  const borderStyle = document.getElementById("borderStyle").value;
  const borderColor = document.getElementById("borderColor").value;
  const padding = document.getElementById("padding").value;
  const textAlign = document.getElementById("textAlign").value;

  selectedCell.style.fontSize = fontSize + "px";
  selectedCell.style.color = textColor;
  selectedCell.style.backgroundColor = bgColor;
  selectedCell.style.border = `1px ${borderStyle} ${borderColor}`;
  selectedCell.style.padding = padding + "px";
  selectedCell.style.textAlign = textAlign;

  updateHtmlOutput();

  // Also update CKEditor with new style immediately
  if (!updatingFromPreview) {
    updatingFromEditor = true;
    editorInstance.setData(document.getElementById("livePreview").innerHTML);
    updatingFromEditor = false;
  }
}

function clearCellStyle() {
  if (!selectedCell) {
    alert("Please click on a table cell in the preview.");
    return;
  }
  selectedCell.removeAttribute("style");
  updateHtmlOutput();

  // Sync to CKEditor
  if (!updatingFromPreview) {
    updatingFromEditor = true;
    editorInstance.setData(document.getElementById("livePreview").innerHTML);
    updatingFromEditor = false;
  }
}

function updateHtmlOutput() {
  const rawHtml = document.getElementById("livePreview").innerHTML.trim();
  const cleanedHtml = stripFigureWrapper(rawHtml);
  const hexHtml = convertRgbToHexInHtml(cleanedHtml);

  const selectedLang = document.getElementById("languageSelector").value;
  const selectedFont = getFontByLanguage(selectedLang);

  const temp = document.createElement("div");
  temp.innerHTML = hexHtml;

  temp.querySelectorAll("p, td, th, ul, ol, li").forEach((el) => {
    el.style.fontFamily = selectedFont;
    el.style.fontSize = "13.5px";
  });

  let finalHtml = temp.innerHTML;
  let formattedHtml = formatHtml(finalHtml).replace(/&quot;/g, "'");

  const firstChar = formattedHtml.charAt(0);
  const lastChar = formattedHtml.charAt(formattedHtml.length - 1);
  const removable = ["<", ">", '"', "'"];
  if (removable.includes(firstChar)) formattedHtml = formattedHtml.substring(1);
  if (removable.includes(lastChar))
    formattedHtml = formattedHtml.substring(0, formattedHtml.length - 1);

  const codeBlock = document.getElementById("htmlCodeBlock");
  codeBlock.textContent = formattedHtml;
  Prism.highlightElement(codeBlock);
}

function formatHtml(html) {
  const tab = "  ";
  let result = "";
  let indent = "";

  html.split(/>\s*</).forEach((element, i) => {
    if (i > 0) result += "\n";
    if (element.match(/^\/\w/)) indent = indent.substring(tab.length);
    result += indent + "<" + element + ">";
    if (element.match(/^<?\w[^>]*[^\/]$/)) indent += tab;
  });

  return result;
}

function stripFigureWrapper(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  const figures = temp.querySelectorAll("figure.table");
  figures.forEach((figure) => {
    const table = figure.querySelector("table");
    if (table) figure.replaceWith(table);
  });
  return temp.innerHTML;
}

function rgbToHex(rgb) {
  const result = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(rgb);
  return result
    ? "#" +
        result
          .slice(1)
          .map((n) => ("0" + parseInt(n).toString(16)).slice(-2))
          .join("")
    : rgb;
}

function convertRgbToHexInHtml(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  temp.querySelectorAll("[style]").forEach((el) => {
    let style = el.getAttribute("style");
    const rgbMatches = style.match(/rgb\(\d+,\s*\d+,\s*\d+\)/g);
    if (rgbMatches) {
      rgbMatches.forEach((rgb) => {
        style = style.replace(rgb, rgbToHex(rgb));
      });
      el.setAttribute("style", style);
    }
  });
  return temp.innerHTML;
}

// Debounce utility
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Update slider labels
const fontSizeSlider = document.getElementById("fontSize");
const paddingSlider = document.getElementById("padding");
fontSizeSlider.oninput = () => {
  document.getElementById("fontSizeVal").textContent = fontSizeSlider.value;
};
paddingSlider.oninput = () => {
  document.getElementById("paddingVal").textContent = paddingSlider.value;
};

function copyHTML() {
  const content = document.getElementById("htmlCodeBlock").textContent.trim();
  if (!content) {
    alert("There is no generated HTML code to copy.");
    return;
  }
  navigator.clipboard.writeText(content).then(() => {
    alert("HTML code copied to clipboard!");
  });
}
