console.log("Renderer script loaded");

const welcomeContainer = document.getElementById("welcome-container");
const editorContainer = document.getElementById("editor-container");
const welcomeOpenBtn = document.getElementById("welcome-open-btn");
const projectPathEl = document.getElementById("project-path");
const ignoreEditorArea = document.getElementById("ignore-editor-area");
const matchEditorArea = document.getElementById("match-editor-area");
const previewContent = document.getElementById("preview-content");
const previewStatus = document.getElementById("preview-status");
const envFilenames = document.getElementById("env-filenames");
const envIgnorePath = document.getElementById("env-ignore-path");
const envPath = document.getElementById("env-path");

let currentProjectPath = null;
let patternFiles = {
   ignoreFiles: [],
   matchFiles: []
};
let editors = {
   ignore: [],
   match: []
};

// Preview state
let tempDirectory = null;
let previewUpdateTimer = null;
let previewDelayTimer = null;
let lastChangeTime = null;

// Environment variables
let envVars = {
   MULLE_MATCH_FILENAMES: "",
   MULLE_MATCH_IGNORE_PATH: "",
   MULLE_MATCH_PATH: ""
};
let originalEnvVars = {};

// Menu event handlers
window.electronAPI.onMenuOpen(() => {
   openProject();
});

window.electronAPI.onMenuSave(() => {
   saveAll();
});

welcomeOpenBtn.addEventListener("click", () => {
   openProject();
});

async function openProject() {
   const result = await window.electronAPI.openDirectoryDialog();
   if (!result.canceled && result.filePaths.length > 0) {
      const projectPath = result.filePaths[0];
      await loadProject(projectPath);
   }
}

async function loadProject(projectPath) {
   console.log("Loading project:", projectPath);
   
   // Validate project has .mulle folder
   const validation = await window.electronAPI.validateProject(projectPath);
   if (!validation.valid) {
      alert("Cannot open directory: No .mulle folder found.\n\nPlease select a valid mulle project directory.");
      return;
   }
   
   currentProjectPath = projectPath;
   projectPathEl.textContent = projectPath;
   
   // Scan for pattern files
   try {
      const files = await window.electronAPI.scanPatternFiles(projectPath);
      patternFiles = files;
      
      console.log("Found ignore files:", files.ignoreFiles.length);
      console.log("Found match files:", files.matchFiles.length);
      
      // Sort files by name
      files.ignoreFiles.sort((a, b) => a.name.localeCompare(b.name));
      files.matchFiles.sort((a, b) => a.name.localeCompare(b.name));
      
      // Load environment variables
      await loadEnvironmentVariables();
      
      // Auto-open all files
      await openAllFiles(files.ignoreFiles, "ignore");
      await openAllFiles(files.matchFiles, "match");
      
      // Initialize preview
      await initializePreview();
      
      welcomeContainer.classList.add("hidden");
      editorContainer.classList.remove("hidden");
   } catch (err) {
      console.error("Failed to scan pattern files:", err);
      alert("Error scanning pattern files: " + err.message);
   }
}

async function openAllFiles(files, type) {
   const editorArea = type === "ignore" ? ignoreEditorArea : matchEditorArea;
   
   // Filter files: etc overrides share (by filename)
   const fileMap = new Map();
   
   // First pass: add all share files
   for (const file of files) {
      if (file.location === "share") {
         fileMap.set(file.name, file);
      }
   }
   
   // Second pass: etc files override share files with same name
   for (const file of files) {
      if (file.location === "etc") {
         fileMap.set(file.name, file);
      }
   }
   
   const uniqueFiles = Array.from(fileMap.values());
   uniqueFiles.sort((a, b) => a.name.localeCompare(b.name));
   
   if (uniqueFiles.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "empty-message";
      emptyMsg.textContent = "No pattern files found";
      editorArea.appendChild(emptyMsg);
      return;
   }
   
   for (const file of uniqueFiles) {
      const result = await window.electronAPI.readFile(file.path);
      if (result.success) {
         createEditor(file, result.content, type);
      } else {
         console.error("Failed to read", file.path, result.error);
      }
   }
}

function createEditor(file, content, type) {
   const editorArea = type === "ignore" ? ignoreEditorArea : matchEditorArea;
   const editorList = editors[type];
   
   const editorWrapper = document.createElement("div");
   editorWrapper.className = "editor-wrapper";
   
   const editorHeader = document.createElement("div");
   editorHeader.className = "editor-header";
   
   const editorTitle = document.createElement("div");
   editorTitle.className = "editor-title";
   
   const titleText = document.createElement("span");
   titleText.textContent = file.name;
   editorTitle.appendChild(titleText);
   
   const titleBadges = document.createElement("span");
   titleBadges.className = "editor-title-badges";
   
   const locationBadge = document.createElement("span");
   locationBadge.className = `file-location file-location-${file.location}`;
   locationBadge.textContent = file.location;
   titleBadges.appendChild(locationBadge);
   
   if (file.isSymlink) {
      const symlinkBadge = document.createElement("span");
      symlinkBadge.className = "file-symlink";
      symlinkBadge.textContent = "symlink";
      titleBadges.appendChild(symlinkBadge);
   }
   
   editorTitle.appendChild(titleBadges);
   editorHeader.appendChild(editorTitle);
   
   const closeBtn = document.createElement("button");
   closeBtn.className = "editor-close-btn";
   closeBtn.textContent = "×";
   closeBtn.title = "Close editor";
   closeBtn.addEventListener("click", () => closeEditor(file, type));
   editorHeader.appendChild(closeBtn);
   
   const textarea = document.createElement("textarea");
   textarea.className = "editor-textarea";
   textarea.value = content;
   textarea.spellcheck = false;
   
   // Auto-size textarea to content (number of lines + 1)
   const lineCount = content.split('\n').length;
   textarea.rows = lineCount + 1;
   
   textarea.addEventListener("input", () => {
      const editor = editorList.find(e => e.file.path === file.path);
      if (editor) {
         editor.modified = true;
         editorTitle.classList.add("modified");
      }
      // Auto-resize on input
      const newLineCount = textarea.value.split('\n').length;
      textarea.rows = newLineCount + 1;
      
      // Trigger preview update
      schedulePreviewUpdate();
   });
   
   editorWrapper.appendChild(editorHeader);
   editorWrapper.appendChild(textarea);
   editorArea.appendChild(editorWrapper);
   
   editorList.push({
      file,
      textarea,
      wrapper: editorWrapper,
      modified: false
   });
}

function closeEditor(file, type) {
   const editorList = editors[type];
   const index = editorList.findIndex(e => e.file.path === file.path);
   if (index === -1) return;
   
   const editor = editorList[index];
   
   if (editor.modified) {
      const confirm = window.confirm(`Close ${file.name} without saving changes?`);
      if (!confirm) return;
   }
   
   editor.wrapper.remove();
   editorList.splice(index, 1);
}

async function saveAll() {
   if (!currentProjectPath) {
      console.log("No project loaded");
      return;
   }
   
   // Save environment variables first
   await saveEnvironmentVariables();
   
   console.log("Save all files - to be implemented");
   // TODO: Save all modified files
}

// Preview functionality
async function initializePreview() {
   try {
      const result = await window.electronAPI.createTempDirectory();
      if (result.success) {
         tempDirectory = result.path;
         console.log("Created temp directory:", tempDirectory);
         await updatePreview();
      } else {
         console.error("Failed to create temp directory:", result.error);
         showPreviewError("Failed to create temporary directory");
      }
   } catch (err) {
      console.error("Preview initialization error:", err);
      showPreviewError(err.message);
   }
}

function schedulePreviewUpdate() {
   lastChangeTime = Date.now();
   
   // Clear existing timers
   if (previewDelayTimer) {
      clearTimeout(previewDelayTimer);
   }
   if (previewUpdateTimer) {
      clearTimeout(previewUpdateTimer);
   }
   
   // Schedule update with 1s delay, max 5s total
   previewDelayTimer = setTimeout(() => {
      const elapsed = Date.now() - lastChangeTime;
      if (elapsed >= 1000 || elapsed >= 5000) {
         updatePreview();
      }
   }, 1000);
   
   // Force update after 5s max
   previewUpdateTimer = setTimeout(() => {
      updatePreview();
   }, 5000);
}

async function updatePreview() {
   if (!tempDirectory || !currentProjectPath) return;
   
   try {
      previewStatus.textContent = "Updating...";
      previewStatus.className = "preview-status running";
      
      // Write all editor contents to temp directory
      for (const editor of editors.ignore) {
         await window.electronAPI.writeTempFile(
            tempDirectory,
            "ignore.d",
            editor.file.name,
            editor.textarea.value
         );
      }
      
      for (const editor of editors.match) {
         await window.electronAPI.writeTempFile(
            tempDirectory,
            "match.d",
            editor.file.name,
            editor.textarea.value
         );
      }
      
      // Run mulle-match with environment variables
      const result = await window.electronAPI.runMulleMatch(currentProjectPath, tempDirectory, envVars);
      
      if (result.success) {
         displayPreviewResults(result.files, result.count);
         previewStatus.textContent = `${result.count} files matched`;
         previewStatus.className = "preview-status ready";
      } else {
         showPreviewError(result.error || "mulle-match failed");
      }
   } catch (err) {
      console.error("Preview update error:", err);
      showPreviewError(err.message);
   }
}

function displayPreviewResults(files, count) {
   previewContent.innerHTML = "";
   
   if (count === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "preview-loading";
      emptyMsg.textContent = "No files matched";
      previewContent.appendChild(emptyMsg);
      return;
   }
   
   for (const file of files) {
      const fileDiv = document.createElement("div");
      fileDiv.className = "preview-file";
      fileDiv.textContent = file;
      previewContent.appendChild(fileDiv);
   }
}

function showPreviewError(message) {
   previewStatus.textContent = `Error: ${message}`;
   previewStatus.className = "preview-status error";
   
   previewContent.innerHTML = "";
   const errorDiv = document.createElement("div");
   errorDiv.className = "preview-loading";
   errorDiv.style.color = "#e74c3c";
   errorDiv.textContent = `Error: ${message}`;
   previewContent.appendChild(errorDiv);
}

// Environment variable management
async function loadEnvironmentVariables() {
   const keys = ["MULLE_MATCH_FILENAMES", "MULLE_MATCH_IGNORE_PATH", "MULLE_MATCH_PATH"];
   
   for (const key of keys) {
      const result = await window.electronAPI.getMulleEnv(currentProjectPath, key);
      if (result.success) {
         envVars[key] = result.value;
         originalEnvVars[key] = result.value;
      }
   }
   
   envFilenames.value = envVars.MULLE_MATCH_FILENAMES || "";
   envIgnorePath.value = envVars.MULLE_MATCH_IGNORE_PATH || "";
   envPath.value = envVars.MULLE_MATCH_PATH || "";
   
   // Clear placeholder
   envFilenames.placeholder = "";
   envIgnorePath.placeholder = "";
   envPath.placeholder = "";
   
   // Setup change listeners
   envFilenames.addEventListener("input", () => {
      envVars.MULLE_MATCH_FILENAMES = envFilenames.value;
      checkEnvModified(envFilenames, "MULLE_MATCH_FILENAMES");
      schedulePreviewUpdate();
   });
   
   envIgnorePath.addEventListener("input", () => {
      envVars.MULLE_MATCH_IGNORE_PATH = envIgnorePath.value;
      checkEnvModified(envIgnorePath, "MULLE_MATCH_IGNORE_PATH");
      schedulePreviewUpdate();
   });
   
   envPath.addEventListener("input", () => {
      envVars.MULLE_MATCH_PATH = envPath.value;
      checkEnvModified(envPath, "MULLE_MATCH_PATH");
      schedulePreviewUpdate();
   });
}

function checkEnvModified(inputElement, key) {
   if (envVars[key] !== originalEnvVars[key]) {
      inputElement.classList.add("modified");
   } else {
      inputElement.classList.remove("modified");
   }
}

async function saveEnvironmentVariables() {
   const keys = ["MULLE_MATCH_FILENAMES", "MULLE_MATCH_IGNORE_PATH", "MULLE_MATCH_PATH"];
   
   for (const key of keys) {
      if (envVars[key] !== originalEnvVars[key]) {
         console.log(`Saving ${key}:`, envVars[key]);
         const result = await window.electronAPI.setMulleEnv(currentProjectPath, key, envVars[key]);
         if (result.success) {
            originalEnvVars[key] = envVars[key];
            
            // Remove modified class
            if (key === "MULLE_MATCH_FILENAMES") envFilenames.classList.remove("modified");
            if (key === "MULLE_MATCH_IGNORE_PATH") envIgnorePath.classList.remove("modified");
            if (key === "MULLE_MATCH_PATH") envPath.classList.remove("modified");
         } else {
            console.error(`Failed to save ${key}:`, result.error);
            alert(`Failed to save ${key}: ${result.error}`);
         }
      }
   }
}

// Cleanup on window close
window.addEventListener("beforeunload", async () => {
   if (tempDirectory) {
      await window.electronAPI.cleanupTempDirectory(tempDirectory);
   }
});
