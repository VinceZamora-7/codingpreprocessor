let editorInstance;
let selectedCell = null;
 
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
  })
  .catch((error) => console.error(error));
 
function renderOutput() {
  applyLanguageFont();
}
 
function applyLanguageFont() {
  const selectedLang = document.getElementById("languageSelector").value;
  const selectedFont = fontMap[selectedLang] || fontMap["en"];
  const fontSize = document.getElementById("fontSize").value + "px"; // ✅ define fontSize
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
 
let selectedCells = new Set(); // This will store the selected cells
 
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
  const rawHtml = document.getElementById("livePreview").innerHTML.trim();
  const cleanedHtml = stripFigureWrapper(rawHtml);
 
  const temp = document.createElement("div");
  temp.innerHTML = cleanedHtml;
 
  temp.querySelectorAll("p, td, th, ul, ol, li").forEach((el) => {
    el.style.fontFamily = selectedFont;
    el.style.fontSize = fontSize;
  });
 
  temp.querySelectorAll("a").forEach((link) => {
    link.style.textDecoration = "underline";
    link.style.color = "#0067b8";
    link.setAttribute("target", "_blank");
  });
 
  temp.querySelectorAll("[style]").forEach((el) => {
    el.setAttribute("style", convertRgbToHex(el.getAttribute("style")));
  });
 
  let finalHtml = temp.innerHTML;
 
  const isForEmail = document.getElementById("forEmail").checked;
  if (isForEmail) {
    const emailWrapper = `
      <div style="margin: 0px; line-height:24px; padding: 40px 30px; font-size: 16px; font-family: 'Segoe UI'; color: #000000;">
        ${finalHtml}
      </div>
    `;
    finalHtml = emailWrapper;
  }
 
  let formattedHtml = formatHtml(finalHtml).replace(/&quot;/g, "'");
 
  const firstChar = formattedHtml.charAt(0);
  const lastChar = formattedHtml.charAt(formattedHtml.length - 1);
  const removable = ["<", ">", '"', "'"];
  if (removable.includes(firstChar)) {
    formattedHtml = formattedHtml.substring(1);
  }
  if (removable.includes(lastChar)) {
    formattedHtml = formattedHtml.substring(0, formattedHtml.length - 1);
  }
 
  const codeBlock = document.getElementById("htmlCodeBlock");
  codeBlock.textContent = formattedHtml;
 
  Prism.highlightElement(codeBlock);
}
 
// New function to insert <hr> tag
function insertDivider() {
  const preview = document.getElementById("livePreview");
  const hrElement = document.createElement("hr"); // Create <hr> element
  preview.appendChild(hrElement); // Append it to the live preview
 
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
  if (selectedCells.size === 0) {
    alert("Please select one or more table cells in the preview.");
    return;
  }
 
  const fontSize = document.getElementById("fontSize").value + "px";
  const textColor = document.getElementById("textColor").value;
  const bgColor = document.getElementById("bgColor").value;
  const padding = document.getElementById("padding").value + "px";
  const textAlign = document.getElementById("textAlign").value;
 
  // Apply the style to all selected cells
  selectedCells.forEach((cell) => {
    cell.style.fontSize = fontSize;
    cell.style.color = textColor;
    cell.style.backgroundColor = bgColor;
    cell.style.padding = padding;
    cell.style.textAlign = textAlign;
  });
 
  updateHtmlOutput();
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
 
 
