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
    "bulletedList",
    "numberedList",
    "undo",
    "redo",
    "insertTable",
    "link",
  ],
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
    cell.onclick = () => {
      if (selectedCell) selectedCell.classList.remove("selected");
      selectedCell = cell;
      selectedCell.classList.add("selected");
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
 
  // Convert RGB to HEX in style attributes
  temp.querySelectorAll("[style]").forEach((el) => {
    el.setAttribute("style", convertRgbToHex(el.getAttribute("style")));
  });
 
  let finalHtml = temp.innerHTML;
 
  // Check if the "Is this for Email?" checkbox is checked
  const isForEmail = document.getElementById("forEmail").checked;
  if (isForEmail) {
    const emailWrapper = `
      <div style="margin: 0px; line-height:24px; padding: 40px 30px; font-size: 16px; font-family: 'Segoe UI'; color: #000000;">
        ${finalHtml}
      </div>
    `;
    finalHtml = emailWrapper;
  }
 
  const codeBlock = document.getElementById("htmlCodeBlock");
  codeBlock.textContent = finalHtml;
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
  if (!selectedCell) {
    alert("Please click on a table cell in the preview.");
    return;
  }
 
  selectedCell.style.fontSize =
    document.getElementById("fontSize").value + "px";
  selectedCell.style.color = document.getElementById("textColor").value;
  selectedCell.style.backgroundColor = document.getElementById("bgColor").value;
  selectedCell.style.padding = document.getElementById("padding").value + "px";
  selectedCell.style.textAlign = document.getElementById("textAlign").value;
 
  updateHtmlOutput();
}
 
function clearCellStyle() {
  if (!selectedCell) {
    alert("Please click on a table cell in the preview.");
    return;
  }
 
  selectedCell.removeAttribute("style");
  updateHtmlOutput();
}
 
function copyHTML() {
  const content = document.getElementById("htmlOutput").textContent.trim();
  if (!content) {
    alert("There is no generated HTML code to copy.");
    return;
  }
  navigator.clipboard.writeText(content).then(() => {
    alert("HTML code copied to clipboard!");
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
 
 
