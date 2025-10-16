let editorInstance;
let selectedCells = new Set(); // This will store the selected cells
 
const fontMap = {
  en: "'Segoe UI'",
  ja: "'Yu Gothic'",
  ko: "'Malgun Gothic'",
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
  preview.innerHTML = content.trim();
 
  preview.querySelectorAll("table").forEach((table) => {
    table.setAttribute("cellpadding", "0");
    table.setAttribute("cellspacing", "0");
    table.style.border = "1px solid #000000";
    table.style.borderCollapse = "collapse";
  });
 
  preview.querySelectorAll("td, th").forEach((cell) => {
    cell.style.border = "1px solid #000000";
    cell.style.padding = "10px";
    cell.onclick = (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        // Allow multiple cell selection with Ctrl or Shift key
        cell.classList.toggle("selected");
        if (cell.classList.contains("selected")) {
          selectedCells.add(cell);
        } else {
          selectedCells.delete(cell);
        }
      } else {
        // Clear previous selections and select only the clicked cell
        selectedCells.forEach((c) => c.classList.remove("selected"));
        selectedCells.clear();
        cell.classList.add("selected");
        selectedCells.add(cell);
      }
    };
  });
 
  applyLanguageFont();
}
 
function updateHtmlOutput(selectedFont = fontMap["en"]) {
  const preview = document.getElementById("livePreview");
  const rawHtml = preview.innerHTML.trim();
  const cleanedHtml = stripFigureWrapper(rawHtml);

  const temp = document.createElement("div");
  temp.innerHTML = cleanedHtml;

  const fontSize = document.getElementById("fontSize").value + "pt";
  const isForEmail = document.getElementById("forEmail").checked;

  // Apply font styles to all relevant elements
  temp.querySelectorAll("p, td, th, ul, ol, li, div, span").forEach((el) => {
    el.style.fontFamily = selectedFont;
    el.style.fontSize = fontSize;
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

  let finalHtml = temp.innerHTML;

  // Wrap for email if needed
  if (isForEmail) {
    finalHtml = `
      <div style="margin: 0px; line-height:24px; padding: 40px 30px; font-size: ${fontSize}; font-family: ${selectedFont}; color: #000000;">
        ${finalHtml}
      </div>
    `;
  }

  // Format and clean up HTML
  let formattedHtml = formatHtml(finalHtml).replace(/&quot;/g, "'");

  const removable = ["<", ">", '"', "'"];
  if (removable.includes(formattedHtml.charAt(0))) {
    formattedHtml = formattedHtml.substring(1);
  }
  if (removable.includes(formattedHtml.charAt(formattedHtml.length - 1))) {
    formattedHtml = formattedHtml.substring(0, formattedHtml.length - 1);
  }

  // Output to code block
  const codeBlock = document.getElementById("htmlCodeBlock");
  codeBlock.textContent = formattedHtml;

  Prism.highlightElement(codeBlock);
}
 
// New function to insert <hr> tag
function insertDivider() {
  const preview = document.getElementById("livePreview");
  const hrElement = document.createElement("hr");
  hrElement.style.border = "0";
  hrElement.style.height = "1px";
  hrElement.style.backgroundColor = "#A2A2A2";
  hrElement.style.margin = "0";
  hrElement.style.lineHeight = "1px";
  hrElement.style.padding = "0px";
  preview.appendChild(hrElement);
 
  updateHtmlOutput(); // Update the generated HTML
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
  const padding = document.getElementById("padding").value + "px";
  const textAlign = document.getElementById("textAlign").value;

  const selectedLang = document.getElementById("languageSelector").value;
  const selectedFont = fontMap[selectedLang] || fontMap["en"];

  const preview = document.getElementById("livePreview");

  // Apply styles to selected table cells
  if (selectedCells.size > 0) {
    selectedCells.forEach((cell) => {
      cell.style.fontSize = fontSize;
      cell.style.color = textColor;
      cell.style.backgroundColor = bgColor;
      cell.style.padding = padding;
      cell.style.textAlign = textAlign;
      cell.style.fontFamily = selectedFont;
    });
  }

  // Apply font styles globally to non-table elements
  preview.querySelectorAll("p, span, div, ul, ol, li").forEach((el) => {
    el.style.fontSize = fontSize;
    el.style.color = textColor;
    el.style.fontFamily = selectedFont;
  });

  updateHtmlOutput(selectedFont);
}
 
function clearCellStyle() {
  if (selectedCells.size === 0) {
    alert("Please select one or more table cells in the preview.");
    return;
  }
 
  // Remove styles from all selected cells
  selectedCells.forEach((cell) => {
    cell.removeAttribute("style");
  });
 
  // Clear the selected cells Set
  selectedCells.clear();
 
  updateHtmlOutput();
}
 
function copyHTML() {
  const content = document.getElementById("htmlOutput").textContent.trim();
 
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
 
 


