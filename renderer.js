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
const editors = {
   ignore: [],
   match : []
};

// Preview state
let tempDirectory = null;
let previewUpdateTimer = null;
let previewDelayTimer = null;
let lastChangeTime = null;

// Environment variables
const envVars = {
   MULLE_MATCH_FILENAMES  : "",
   MULLE_MATCH_IGNORE_PATH: "",
   MULLE_MATCH_PATH       : ""
};
const originalEnvVars = {};

// Preferences
let preferences = {
   showBadges: false
};

// Menu event handlers
window.electronAPI.onMenuOpen(() => 
{
   openProject();
});

window.electronAPI.onMenuSave(() => 
{
   saveAll();
});

window.electronAPI.onOpenRecentProject((projectPath) => 
{
   loadProject(projectPath);
});

window.electronAPI.onMenuPreferences(() => 
{
   openPreferences();
});

window.electronAPI.onMenuAddFile(() => 
{
   // Will be handled by + buttons with type context
});

window.electronAPI.onMenuDeleteFile(() => 
{
   deleteSelectedFile();
});

welcomeOpenBtn.addEventListener("click", () => 
{
   openProject();
});

// Add file button handlers
document.getElementById("add-ignore-btn").addEventListener("click", () => 
{
   addNewFile("ignore");
});

document.getElementById("add-match-btn").addEventListener("click", () => 
{
   addNewFile("match");
});

// Load recent projects and preferences on startup
loadRecentProjects();
loadPreferences();

async function openProject() 
{
   const result = await window.electronAPI.openDirectoryDialog();
   if (!result.canceled && result.filePaths.length > 0) 
   {
      const projectPath = result.filePaths[0];
      await loadProject(projectPath);
   }
}

async function loadProject(projectPath) 
{
   console.log("Loading project:", projectPath);
   
   // Validate project has .mulle folder
   const validation = await window.electronAPI.validateProject(projectPath);
   if (!validation.valid) 
   {
      alert("Cannot open directory: No .mulle folder found.\n\nPlease select a valid mulle project directory.");
      return;
   }
   
   // Check if match directories exist
   const etcMatchExists = await window.electronAPI.fileExists(`${projectPath}/.mulle/etc/match`);
   const shareMatchExists = await window.electronAPI.fileExists(`${projectPath}/.mulle/share/match`);
   
   // If no match directories, check for craft and offer to switch
   if (!etcMatchExists.exists && !shareMatchExists.exists) 
   {
      console.log("No match directories found, checking for craft...");
      
      const etcCraftExists = await window.electronAPI.fileExists(`${projectPath}/.mulle/etc/craft`);
      
      if (etcCraftExists.exists) 
      {
         // etc/craft exists, switch to it
         const switchToCraft = window.confirm(
            "No pattern directories found in .mulle/etc/match or .mulle/share/match.\n\n" +
            "However, .mulle/etc/craft exists.\n\n" +
            "Switch to craft directory?\n" +
            "(Will open .mulle/etc/craft instead)"
         );
         
         if (switchToCraft) 
         {
            projectPath = `${projectPath}/.mulle/etc/craft`;
            console.log("Switched to craft directory:", projectPath);
         }
         else 
         {
            return;
         }
      }
      else 
      {
         // No craft either, offer to create it
         const createCraft = window.confirm(
            "No pattern directories found.\n\n" +
            "Create .mulle/etc/craft directory structure?\n" +
            "(Will create match.d and ignore.d folders)"
         );
         
         if (createCraft) 
         {
            const result = await window.electronAPI.createCraftDirectory(projectPath);
            if (!result.success) 
            {
               alert("Failed to create craft directory: " + result.error);
               return;
            }
            
            projectPath = `${projectPath}/.mulle/etc/craft`;
            console.log("Created and switched to craft directory:", projectPath);
         }
         else 
         {
            return;
         }
      }
   }
   
   // Add to recent projects
   await window.electronAPI.addRecentProject(projectPath);
   
   currentProjectPath = projectPath;
   projectPathEl.textContent = projectPath;
   
   // Scan for pattern files
   try 
   {
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
   }
   catch (err) 
   {
      console.error("Failed to scan pattern files:", err);
      alert("Error scanning pattern files: " + err.message);
   }
}

async function openAllFiles(files, type) 
{
   const editorArea = type === "ignore" ? ignoreEditorArea : matchEditorArea;
   
   // Filter files: etc overrides share (by filename)
   const fileMap = new Map();
   
   // First pass: add all share files
   for (const file of files) 
   {
      if (file.location === "share") 
      {
         fileMap.set(file.name, file);
      }
   }
   
   // Second pass: etc files override share files with same name
   for (const file of files) 
   {
      if (file.location === "etc") 
      {
         fileMap.set(file.name, file);
      }
   }
   
   const uniqueFiles = Array.from(fileMap.values());
   uniqueFiles.sort((a, b) => a.name.localeCompare(b.name));
   
   if (uniqueFiles.length === 0) 
   {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "empty-message";
      emptyMsg.textContent = "No pattern files found";
      editorArea.appendChild(emptyMsg);
      return;
   }
   
   for (const file of uniqueFiles) 
   {
      const result = await window.electronAPI.readFile(file.path);
      if (result.success) 
      {
         createEditor(file, result.content, type);
      }
      else 
      {
         console.error("Failed to read", file.path, result.error);
      }
   }
}

function createEditor(file, content, type) 
{
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
   
   if (preferences.showBadges) 
   {
      const titleBadges = document.createElement("span");
      titleBadges.className = "editor-title-badges";
      
      const locationBadge = document.createElement("span");
      locationBadge.className = `file-location file-location-${file.location}`;
      locationBadge.textContent = file.location;
      titleBadges.appendChild(locationBadge);
      
      if (file.isSymlink) 
      {
         const symlinkBadge = document.createElement("span");
         symlinkBadge.className = "file-symlink";
         symlinkBadge.textContent = "symlink";
         titleBadges.appendChild(symlinkBadge);
      }
      
      editorTitle.appendChild(titleBadges);
   }
   
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
   const lineCount = content.split("\n").length;
   textarea.rows = lineCount + 1;
   
   textarea.addEventListener("input", () => 
   {
      const editor = editorList.find(e => e.file.path === file.path);
      if (editor) 
      {
         editor.modified = true;
         editorTitle.classList.add("modified");
      }
      // Auto-resize on input
      const newLineCount = textarea.value.split("\n").length;
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
      wrapper : editorWrapper,
      modified: false
   });
}

function closeEditor(file, type) 
{
   const editorList = editors[type];
   const index = editorList.findIndex(e => e.file.path === file.path);
   if (index === -1) 
   {
      return;
   }
   
   const editor = editorList[index];
   
   if (editor.modified) 
   {
      const confirm = window.confirm(`Close ${file.name} without saving changes?`);
      if (!confirm) 
      {
         return;
      }
   }
   
   editor.wrapper.remove();
   editorList.splice(index, 1);
}

async function saveAll() 
{
   if (!currentProjectPath) 
   {
      console.log("No project loaded");
      return;
   }
   
   console.log("=== Starting Smart Save ===");
   
   // Save environment variables first
   await saveEnvironmentVariables();
   
   /*
    * SMART SAVE LOGIC:
    * 
    * 1. Save all modified files:
    *    - If file is in share/ → create/update in etc/
    *    - If file is in etc/ → update in place
    *    - If file was a symlink → remove symlink, write real file
    * 
    * 2. After saving, optimize etc/ structure for each directory (ignore.d, match.d):
    *    a) Compare each etc/ file with corresponding share/ file
    *    b) If content is identical → replace etc/ file with symlink to share/
    *    c) If all files in etc/ are symlinks (no unique content) → remove etc/ directory entirely
    * 
    * This ensures:
    *    - etc/ only contains files that differ from share/
    *    - Identical files are symlinked (save space, show relationship)
    *    - Empty/redundant etc/ directories are cleaned up
    */
   
   try 
   {
      // Step 1: Save all modified files
      await saveModifiedFiles();
      
      // Step 2: Optimize etc/ structure (create symlinks, cleanup)
      await optimizeEtcStructure("ignore.d");
      await optimizeEtcStructure("match.d");
      
      console.log("=== Save Complete ===");
      alert("Files saved successfully!");
      
      // Reload project to show updated state
      await loadProject(currentProjectPath);
      
   }
   catch (err) 
   {
      console.error("Save failed:", err);
      alert("Save failed: " + err.message);
   }
}

async function saveModifiedFiles() 
{
   console.log("Step 1: Saving modified files...");
   
   // Delete files marked for deletion
   if (window.filesToDelete && window.filesToDelete.length > 0) 
   {
      console.log("  Deleting marked files...");
      for (const filePath of window.filesToDelete) 
      {
         const exists = await window.electronAPI.fileExists(filePath);
         if (exists.exists) 
         {
            await window.electronAPI.removeFile(filePath);
            console.log(`    Deleted: ${filePath}`);
         }
      }
      window.filesToDelete = [];
   }
   
   const allEditors = [...editors.ignore, ...editors.match];
   
   for (const editor of allEditors) 
   {
      if (!editor.modified) 
      {
         continue;
      }
      
      const file = editor.file;
      const content = editor.textarea.value;
      
      console.log(`  Saving: ${file.name} (location: ${file.location}, symlink: ${file.isSymlink})`);
      
      // Determine target path
      let targetPath = file.path;
      
      // If file is in share/, we must create/update in etc/
      if (file.location === "share") 
      {
         const etcDir = file.path.includes("ignore.d") 
            ? `${currentProjectPath}/.mulle/etc/match/ignore.d`
            : `${currentProjectPath}/.mulle/etc/match/match.d`;
         
         targetPath = `${etcDir}/${file.name}`;
         console.log(`    Moving to etc: ${targetPath}`);
      }
      
      // If target was a symlink, remove it first
      if (file.isSymlink || file.location === "share") 
      {
         const exists = await window.electronAPI.fileExists(targetPath);
         if (exists.exists) 
         {
            await window.electronAPI.removeFile(targetPath);
            console.log(`    Removed old file/symlink`);
         }
      }
      
      // Write the content
      const result = await window.electronAPI.writePatternFile(targetPath, content);
      if (!result.success) 
      {
         throw new Error(`Failed to write ${file.name}: ${result.error}`);
      }
      
      // Mark as saved
      editor.modified = false;
      editor.wrapper.querySelector(".editor-title").classList.remove("modified");
      
      console.log(`    ✓ Saved`);
   }
}

async function optimizeEtcStructure(subdir) 
{
   console.log(`Step 2: Optimizing etc/${subdir}...`);
   
   const etcPath = `${currentProjectPath}/.mulle/etc/match/${subdir}`;
   const sharePath = `${currentProjectPath}/.mulle/share/match/${subdir}`;
   
   // Check if etc directory exists
   const etcExists = await window.electronAPI.fileExists(etcPath);
   if (!etcExists.exists) 
   {
      console.log(`  etc/${subdir} doesn't exist, nothing to optimize`);
      return;
   }
   
   // Get all files in etc/
   const etcResult = await window.electronAPI.listDirectory(etcPath);
   if (!etcResult.success || etcResult.files.length === 0) 
   {
      console.log(`  etc/${subdir} is empty, removing directory`);
      await window.electronAPI.removeDirectory(etcPath);
      return;
   }
   
   let hasUniqueFiles = false;
   
   // For each file in etc/, compare with share/
   for (const filename of etcResult.files) 
   {
      const etcFilePath = `${etcPath}/${filename}`;
      const shareFilePath = `${sharePath}/${filename}`;
      
      // Check if corresponding share file exists
      const shareExists = await window.electronAPI.fileExists(shareFilePath);
      if (!shareExists.exists) 
      {
         console.log(`  ${filename}: unique to etc/ (no share version)`);
         hasUniqueFiles = true;
         continue;
      }
      
      // Read both files
      const etcContent = await window.electronAPI.readPatternFile(etcFilePath);
      const shareContent = await window.electronAPI.readPatternFile(shareFilePath);
      
      if (!etcContent.success || !shareContent.success) 
      {
         console.log(`  ${filename}: couldn't read, keeping as-is`);
         hasUniqueFiles = true;
         continue;
      }
      
      // Compare content
      if (etcContent.content === shareContent.content) 
      {
         console.log(`  ${filename}: identical to share/, creating symlink`);
         
         // Create relative symlink: ../../../share/match/{subdir}/{filename}
         const relativeTarget = `../../../share/match/${subdir}/${filename}`;
         const symlinkResult = await window.electronAPI.createSymlink(relativeTarget, etcFilePath);
         
         if (!symlinkResult.success) 
         {
            console.error(`    Failed to create symlink: ${symlinkResult.error}`);
            hasUniqueFiles = true;
         }
      }
      else 
      {
         console.log(`  ${filename}: differs from share/, keeping file`);
         hasUniqueFiles = true;
      }
   }
   
   // If no unique files (all symlinks), remove etc directory
   if (!hasUniqueFiles) 
   {
      console.log(`  All files are symlinks, removing etc/${subdir}`);
      await window.electronAPI.removeDirectory(etcPath);
   }
   else 
   {
      console.log(`  etc/${subdir} contains unique files, keeping directory`);
   }
}

// Preview functionality
async function initializePreview() 
{
   try 
   {
      const result = await window.electronAPI.createTempDirectory();
      if (result.success) 
      {
         tempDirectory = result.path;
         console.log("Created temp directory:", tempDirectory);
         await updatePreview();
      }
      else 
      {
         console.error("Failed to create temp directory:", result.error);
         showPreviewError("Failed to create temporary directory");
      }
   }
   catch (err) 
   {
      console.error("Preview initialization error:", err);
      showPreviewError(err.message);
   }
}

function schedulePreviewUpdate() 
{
   lastChangeTime = Date.now();
   
   // Clear existing timers
   if (previewDelayTimer) 
   {
      clearTimeout(previewDelayTimer);
   }
   if (previewUpdateTimer) 
   {
      clearTimeout(previewUpdateTimer);
   }
   
   // Schedule update with 1s delay, max 5s total
   previewDelayTimer = setTimeout(() => 
   {
      const elapsed = Date.now() - lastChangeTime;
      if (elapsed >= 1000 || elapsed >= 5000) 
      {
         updatePreview();
      }
   }, 1000);
   
   // Force update after 5s max
   previewUpdateTimer = setTimeout(() => 
   {
      updatePreview();
   }, 5000);
}

async function updatePreview() 
{
   if (!tempDirectory || !currentProjectPath) 
   {
      return;
   }
   
   try 
   {
      previewStatus.textContent = "Updating...";
      previewStatus.className = "preview-status running";
      
      // Write all editor contents to temp directory
      for (const editor of editors.ignore) 
      {
         await window.electronAPI.writeTempFile(
            tempDirectory,
            "ignore.d",
            editor.file.name,
            editor.textarea.value
         );
      }
      
      for (const editor of editors.match) 
      {
         await window.electronAPI.writeTempFile(
            tempDirectory,
            "match.d",
            editor.file.name,
            editor.textarea.value
         );
      }
      
      // Run mulle-match with environment variables
      const result = await window.electronAPI.runMulleMatch(currentProjectPath, tempDirectory, envVars);
      
      if (result.success) 
      {
         displayPreviewResults(result.files, result.count);
         previewStatus.textContent = `${result.count} files matched`;
         previewStatus.className = "preview-status ready";
      }
      else 
      {
         showPreviewError(result.error || "mulle-match failed");
      }
   }
   catch (err) 
   {
      console.error("Preview update error:", err);
      showPreviewError(err.message);
   }
}

function displayPreviewResults(files, count) 
{
   previewContent.innerHTML = "";
   
   if (count === 0) 
   {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "preview-loading";
      emptyMsg.textContent = "No files matched";
      previewContent.appendChild(emptyMsg);
      return;
   }
   
   for (const file of files) 
   {
      const fileDiv = document.createElement("div");
      fileDiv.className = "preview-file";
      fileDiv.textContent = file;
      previewContent.appendChild(fileDiv);
   }
}

function showPreviewError(message) 
{
   previewStatus.textContent = `Error: ${message}`;
   previewStatus.className = "preview-status error";
   
   previewContent.innerHTML = "";
   const errorDiv = document.createElement("div");
   errorDiv.className = "preview-loading";
   errorDiv.style.color = "#e74c3c";
   errorDiv.textContent = `Error: ${message}`;
   previewContent.appendChild(errorDiv);
}

// File management
function addNewFile(type) 
{
   /*
    * FILE NAMING FORMAT: NN-type--category
    * 
    * NN = two-digit number for sorting (10, 20, 30, etc.)
    * type = file type/purpose (e.g., "header", "source", "boring", "generated")
    * category = category name (e.g., "all", "none", "private-headers")
    * 
    * Examples:
    * - 10-boring--none
    * - 65-generated--clib
    * - 80-source--stage2-sources
    * - 85-header--public-headers
    */
   
   const fileName = prompt(
      "Enter file name (format: NN-type--category)\n\n" +
      "Examples:\n" +
      "  10-boring--none\n" +
      "  50-custom--myfiles\n" +
      "  90-source--mysources",
      "50-custom--myfiles"
   );
   
   if (!fileName) 
   {
      return;
   } // User cancelled
   
   // Validate format: NN-type--category
   const validFormat = /^\d{2}-[a-z0-9]+-+[a-z0-9-]+$/i;
   if (!validFormat.test(fileName)) 
   {
      alert(
         "Invalid file name format!\n\n" +
         "Format must be: NN-type--category\n" +
         "- NN: two digits (00-99)\n" +
         "- type: letters/numbers\n" +
         "- --: double dash separator\n" +
         "- category: letters/numbers/dashes"
      );
      return;
   }
   
   // Check if file already exists
   const editorList = editors[type];
   const exists = editorList.find(e => e.file.name === fileName);
   if (exists) 
   {
      alert(`File "${fileName}" already exists!`);
      return;
   }
   
   // Create new file in etc/ (we always create in etc, never in share)
   const subdir = type === "ignore" ? "ignore.d" : "match.d";
   const filePath = `${currentProjectPath}/.mulle/etc/match/${subdir}/${fileName}`;
   
   const newFile = {
      name     : fileName,
      location : "etc",
      path     : filePath,
      isSymlink: false
   };
   
   // Create editor with empty content
   createEditor(newFile, "", type);
   
   // Sort editors by filename
   sortEditors(type);
   
   console.log(`Created new file: ${fileName} in ${type}`);
}

function sortEditors(type) 
{
   const editorArea = type === "ignore" ? ignoreEditorArea : matchEditorArea;
   const editorList = editors[type];
   
   // Sort by filename
   editorList.sort((a, b) => a.file.name.localeCompare(b.file.name));
   
   // Re-append in sorted order
   editorArea.innerHTML = "";
   for (const editor of editorList) 
   {
      editorArea.appendChild(editor.wrapper);
   }
}

function deleteSelectedFile() 
{
   // Find focused editor
   const activeElement = document.activeElement;
   if (!activeElement || activeElement.tagName !== "TEXTAREA") 
   {
      alert("Please click in an editor to select a file to delete");
      return;
   }
   
   // Find which editor owns this textarea
   let targetEditor = null;
   let targetType = null;
   
   for (const type of ["ignore", "match"]) 
   {
      for (const editor of editors[type]) 
      {
         if (editor.textarea === activeElement) 
         {
            targetEditor = editor;
            targetType = type;
            break;
         }
      }
      if (targetEditor) 
      {
         break;
      }
   }
   
   if (!targetEditor) 
   {
      alert("Could not determine which file to delete");
      return;
   }
   
   const fileName = targetEditor.file.name;
   const confirm = window.confirm(
      `Delete file "${fileName}"?\n\n` +
      `This will remove the file from etc/ on next save.`
   );
   
   if (!confirm) 
   {
      return;
   }
   
   // Remove editor from UI
   targetEditor.wrapper.remove();
   
   // Remove from editors list
   const editorList = editors[targetType];
   const index = editorList.indexOf(targetEditor);
   if (index >= 0) 
   {
      editorList.splice(index, 1);
   }
   
   // Mark for deletion (we'll delete on save)
   if (!window.filesToDelete) 
   {
      window.filesToDelete = [];
   }
   window.filesToDelete.push(targetEditor.file.path);
   
   console.log(`Marked for deletion: ${fileName}`);
}

// Environment variable management
async function loadEnvironmentVariables() 
{
   const keys = ["MULLE_MATCH_FILENAMES", "MULLE_MATCH_IGNORE_PATH", "MULLE_MATCH_PATH"];
   
   for (const key of keys) 
   {
      const result = await window.electronAPI.getMulleEnv(currentProjectPath, key);
      if (result.success) 
      {
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
   envFilenames.addEventListener("input", () => 
   {
      envVars.MULLE_MATCH_FILENAMES = envFilenames.value;
      checkEnvModified(envFilenames, "MULLE_MATCH_FILENAMES");
      schedulePreviewUpdate();
   });
   
   envIgnorePath.addEventListener("input", () => 
   {
      envVars.MULLE_MATCH_IGNORE_PATH = envIgnorePath.value;
      checkEnvModified(envIgnorePath, "MULLE_MATCH_IGNORE_PATH");
      schedulePreviewUpdate();
   });
   
   envPath.addEventListener("input", () => 
   {
      envVars.MULLE_MATCH_PATH = envPath.value;
      checkEnvModified(envPath, "MULLE_MATCH_PATH");
      schedulePreviewUpdate();
   });
}

function checkEnvModified(inputElement, key) 
{
   if (envVars[key] !== originalEnvVars[key]) 
   {
      inputElement.classList.add("modified");
   }
   else 
   {
      inputElement.classList.remove("modified");
   }
}

async function saveEnvironmentVariables() 
{
   const keys = ["MULLE_MATCH_FILENAMES", "MULLE_MATCH_IGNORE_PATH", "MULLE_MATCH_PATH"];
   
   for (const key of keys) 
   {
      if (envVars[key] !== originalEnvVars[key]) 
      {
         console.log(`Saving ${key}:`, envVars[key]);
         const result = await window.electronAPI.setMulleEnv(currentProjectPath, key, envVars[key]);
         if (result.success) 
         {
            originalEnvVars[key] = envVars[key];
            
            // Remove modified class
            if (key === "MULLE_MATCH_FILENAMES") 
            {
               envFilenames.classList.remove("modified");
            }
            if (key === "MULLE_MATCH_IGNORE_PATH") 
            {
               envIgnorePath.classList.remove("modified");
            }
            if (key === "MULLE_MATCH_PATH") 
            {
               envPath.classList.remove("modified");
            }
         }
         else 
         {
            console.error(`Failed to save ${key}:`, result.error);
            alert(`Failed to save ${key}: ${result.error}`);
         }
      }
   }
}

// Recent projects management
async function loadRecentProjects() 
{
   const recentProjects = await window.electronAPI.getRecentProjects();
   const container = document.getElementById("recent-projects-list");
   
   if (!container) 
   {
      return;
   }
   
   container.innerHTML = "";
   
   if (recentProjects.length === 0) 
   {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "recent-empty";
      emptyMsg.textContent = "No recent projects";
      container.appendChild(emptyMsg);
      return;
   }
   
   for (const projectPath of recentProjects) 
   {
      const item = document.createElement("div");
      item.className = "recent-item";
      
      const parts = projectPath.split(/[/\\]/);
      const projectName = parts[parts.length - 1];
      const parentName = parts.length >= 2 ? parts[parts.length - 2] : "";
      
      const nameSpan = document.createElement("span");
      nameSpan.className = "recent-name";
      nameSpan.textContent = projectName;
      
      const pathSpan = document.createElement("span");
      pathSpan.className = "recent-path";
      pathSpan.textContent = parentName ? `${parentName}/` : "";
      
      item.appendChild(pathSpan);
      item.appendChild(nameSpan);
      
      item.addEventListener("click", () => 
      {
         loadProject(projectPath);
      });
      
      container.appendChild(item);
   }
}

// Preferences management
async function loadPreferences() 
{
   preferences = await window.electronAPI.getPreferences();
}

function openPreferences() 
{
   const modal = document.getElementById("preferences-modal");
   const showBadgesCheckbox = document.getElementById("pref-show-badges");
   
   showBadgesCheckbox.checked = preferences.showBadges;
   modal.classList.add("show");
}

document.getElementById("close-preferences-modal").addEventListener("click", () => 
{
   document.getElementById("preferences-modal").classList.remove("show");
});

document.getElementById("cancel-preferences").addEventListener("click", () => 
{
   document.getElementById("preferences-modal").classList.remove("show");
});

document.getElementById("save-preferences").addEventListener("click", async () => 
{
   const showBadgesCheckbox = document.getElementById("pref-show-badges");
   
   preferences.showBadges = showBadgesCheckbox.checked;
   
   await window.electronAPI.setPreferences(preferences);
   
   document.getElementById("preferences-modal").classList.remove("show");
   
   // Show message to reload
   alert("Preferences saved. Please reopen the project to see changes.");
});

// Cleanup on window close
window.addEventListener("beforeunload", async () => 
{
   if (tempDirectory) 
   {
      await window.electronAPI.cleanupTempDirectory(tempDirectory);
   }
});
