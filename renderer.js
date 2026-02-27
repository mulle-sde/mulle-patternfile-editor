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

// Deleted files tracking
let showDeletedFiles = false;
const deletedEditors = {
   ignore: [],
   match : []
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

window.electronAPI.onMenuRevert(() => 
{
   revertToSaved();
});

window.electronAPI.onMenuRevertDefaults(() => 
{
   revertToDefaults();
});

window.electronAPI.onMenuToggleDeleted((checked) => 
{
   showDeletedFiles = checked;
   updateDeletedFilesVisibility();
});

window.electronAPI.onMenuDoctor(() => 
{
   runDoctor();
});

window.electronAPI.onOpenRecentProject((projectPath) => 
{
   loadProject(projectPath);
});

window.electronAPI.onOpenProjectPath((projectPath) => 
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
   
   // Clear editors and deleted files state
   editors.ignore = [];
   editors.match = [];
   deletedEditors.ignore = [];
   deletedEditors.match = [];
   window.filesToDelete = [];
   
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
      
      // Update menu state based on etc/ files
      await updateMenuState();
      
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

async function updateMenuState() 
{
   // Check if we have any etc/ files
   let hasEtcFiles = false;
   
   for (const editor of editors.ignore) 
   {
      if (editor.file.location === "etc") 
      {
         hasEtcFiles = true;
         break;
      }
   }
   
   if (!hasEtcFiles) 
   {
      for (const editor of editors.match) 
      {
         if (editor.file.location === "etc") 
         {
            hasEtcFiles = true;
            break;
         }
      }
   }
   
   // Check if we have any share/ files
   let hasShareFiles = false;
   
   for (const editor of editors.ignore) 
   {
      if (editor.file.location === "share") 
      {
         hasShareFiles = true;
         break;
      }
   }
   
   if (!hasShareFiles) 
   {
      for (const editor of editors.match) 
      {
         if (editor.file.location === "share") 
         {
            hasShareFiles = true;
            break;
         }
      }
   }
   
   // Only enable "Revert to Defaults" if we have etc/ files AND share/ files
   // (No point reverting to defaults if there are no defaults!)
   const enableRevertDefaults = hasEtcFiles && hasShareFiles;
   
   // Update the menu
   await window.electronAPI.updateMenuState({ hasEtcFiles: enableRevertDefaults });
}

async function openAllFiles(files, type) 
{
   const editorArea = type === "ignore" ? ignoreEditorArea : matchEditorArea;
   
   let filesToShow;
   
   if (preferences.showBadges) 
   {
      // Show all files (both etc and share versions)
      filesToShow = files;
   }
   else 
   {
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
      
      filesToShow = Array.from(fileMap.values());
   }
   
   filesToShow.sort((a, b) => a.name.localeCompare(b.name));
   
   if (filesToShow.length === 0) 
   {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "empty-message";
      emptyMsg.textContent = "No pattern files found";
      editorArea.appendChild(emptyMsg);
      return;
   }
   
   for (const file of filesToShow) 
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
   
   // Add data attributes for styling based on file origin
   editorWrapper.setAttribute("data-location", file.location);
   editorWrapper.setAttribute("data-symlink", file.isSymlink ? "true" : "false");
   
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
   
   const headerButtons = document.createElement("div");
   headerButtons.className = "editor-header-buttons";
   
   // Only show DELETE button for files in etc (not share)
   if (file.location === "etc") 
   {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "editor-delete-btn";
      deleteBtn.textContent = "DELETE";
      deleteBtn.title = file.isSymlink ? "Remove symlink" : "Delete file";
      deleteBtn.addEventListener("click", () => deleteEditorFile(file, type));
      headerButtons.appendChild(deleteBtn);
   }
   
   const closeBtn = document.createElement("button");
   closeBtn.className = "editor-close-btn";
   closeBtn.textContent = "×";
   closeBtn.title = "Close editor";
   closeBtn.addEventListener("click", () => closeEditor(file, type));
   headerButtons.appendChild(closeBtn);
   
   editorHeader.appendChild(headerButtons);
   
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
         
         // Change header to saturated color when editing starts
         if (file.location !== "etc" || file.isSymlink) 
         {
            editorWrapper.setAttribute("data-location", "etc");
            editorWrapper.setAttribute("data-symlink", "false");
         }
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
   
   // Track which etc directories need symlink creation (first file being saved)
   const needsSymlinks = new Set();
   
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
      let sharePath = null;
      
      // If file is in share/, we must create/update in etc/
      if (file.location === "share") 
      {
         const subdir = file.path.includes("ignore.d") ? "ignore.d" : "match.d";
         const etcDir = `${currentProjectPath}/.mulle/etc/match/${subdir}`;
         
         // Check if this is the first file being created in etc/ for this subdir
         const etcDirExists = await window.electronAPI.fileExists(etcDir);
         if (!etcDirExists.exists) 
         {
            needsSymlinks.add(subdir);
            console.log(`    First file in etc/${subdir}, will create symlinks`);
         }
         
         targetPath = `${etcDir}/${file.name}`;
         sharePath = file.path;
         console.log(`    Moving to etc: ${targetPath}`);
      }
      else 
      {
         // File is in etc/, check if there's a corresponding share file
         const subdir = file.path.includes("ignore.d") ? "ignore.d" : "match.d";
         sharePath = `${currentProjectPath}/.mulle/share/match/${subdir}/${file.name}`;
      }
      
      // Check if content is identical to share version
      let identicalToShare = false;
      if (sharePath) 
      {
         const shareExists = await window.electronAPI.fileExists(sharePath);
         if (shareExists.exists) 
         {
            const shareContent = await window.electronAPI.readPatternFile(sharePath);
            if (shareContent.success && shareContent.content === content) 
            {
               identicalToShare = true;
               console.log(`    Content identical to share version`);
            }
         }
      }
      
      // Remove existing file/symlink
      const exists = await window.electronAPI.fileExists(targetPath);
      if (exists.exists) 
      {
         await window.electronAPI.removeFile(targetPath);
         console.log(`    Removed old file/symlink`);
      }
      
      if (identicalToShare) 
      {
         // Create symlink instead of writing file
         const subdir = file.path.includes("ignore.d") ? "ignore.d" : "match.d";
         const relativeTarget = `../../../share/match/${subdir}/${file.name}`;
         const symlinkResult = await window.electronAPI.createSymlink(relativeTarget, targetPath);
         
         if (!symlinkResult.success) 
         {
            throw new Error(`Failed to create symlink ${file.name}: ${symlinkResult.error}`);
         }
         console.log(`    ✓ Created symlink to share`);
      }
      else 
      {
         // Write the content as a real file
         const result = await window.electronAPI.writePatternFile(targetPath, content);
         if (!result.success) 
         {
            throw new Error(`Failed to write ${file.name}: ${result.error}`);
         }
         console.log(`    ✓ Saved as file`);
      }
      
      // Mark as saved
      editor.modified = false;
      editor.wrapper.querySelector(".editor-title").classList.remove("modified");
   }
   
   // Create symlinks to share files for any new etc directories
   for (const subdir of needsSymlinks) 
   {
      await createShareSymlinks(subdir);
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
      
      // Run mulle-match and evaluate env vars in parallel
      const [result, evalResult] = await Promise.all([
         window.electronAPI.runMulleMatch(currentProjectPath, tempDirectory, envVars),
         window.electronAPI.evaluateEnvVars(currentProjectPath),
      ]);
      const evaluatedVars = evalResult.success ? evalResult.values : null;
      
      if (result.success) 
      {
         displayPreviewResults(result.files, result.count, evaluatedVars);
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

function displayPreviewResults(files, count, evaluatedVars) 
{
   previewContent.innerHTML = "";
   
   // Always show evaluated environment variables at the top
   const envSection = document.createElement("div");
   envSection.className = "preview-env-vars";
   
   const envKeys = ["MULLE_MATCH_FILENAMES", "MULLE_MATCH_IGNORE_PATH", "MULLE_MATCH_PATH"];
   for (const key of envKeys) 
   {
      const row = document.createElement("div");
      row.className = "preview-env-row";
      
      const keySpan = document.createElement("span");
      keySpan.className = "preview-env-key";
      keySpan.textContent = key;
      
      const eqSpan = document.createElement("span");
      eqSpan.className = "preview-env-eq";
      eqSpan.textContent = "=";
      
      const valSpan = document.createElement("span");
      valSpan.className = "preview-env-value";
      
      if (evaluatedVars && evaluatedVars[key] !== undefined) 
      {
         valSpan.textContent = evaluatedVars[key] || "(unset)";
         if (!evaluatedVars[key]) 
         {
            valSpan.classList.add("preview-env-unset");
         }
      }
      else 
      {
         valSpan.textContent = "(unavailable)";
         valSpan.classList.add("preview-env-unset");
      }
      
      row.appendChild(keySpan);
      row.appendChild(eqSpan);
      row.appendChild(valSpan);
      envSection.appendChild(row);
   }
   
   previewContent.appendChild(envSection);
   
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
let currentAddFileType = null;

function addNewFile(type) 
{
   currentAddFileType = type;
   
   // Reset form
   document.getElementById("file-priority").value = "50";
   document.getElementById("file-type").value = "";
   document.getElementById("file-category").value = "";
   updateFilenamePreview();
   
   // Show modal
   document.getElementById("add-file-modal").classList.add("show");
   
   // Focus first input
   setTimeout(() => document.getElementById("file-priority").focus(), 100);
}

function updateFilenamePreview() 
{
   const priority = document.getElementById("file-priority").value || "NN";
   const type = document.getElementById("file-type").value || "type";
   const category = document.getElementById("file-category").value || "category";
   
   const filename = `${priority}-${type}--${category}`;
   document.getElementById("filename-preview").textContent = filename;
}

async function createNewFile() 
{
   const priority = document.getElementById("file-priority").value.trim();
   const type = document.getElementById("file-type").value.trim();
   const category = document.getElementById("file-category").value.trim();
   
   // Validate priority (must be exactly 2 digits)
   if (!/^\d{2}$/.test(priority)) 
   {
      alert("Priority must be exactly 2 digits (00-99)\n\nExamples: 10, 50, 99");
      document.getElementById("file-priority").focus();
      return;
   }
   
   // Validate type (identifier: letters, numbers, underscores only)
   if (!/^[a-z0-9_]+$/i.test(type)) 
   {
      alert("Type must be a valid identifier:\n- Letters (a-z, A-Z)\n- Numbers (0-9)\n- Underscores (_)\n\nNo spaces, hyphens, or special characters allowed.");
      document.getElementById("file-type").focus();
      return;
   }
   
   // Validate category (identifier: letters, numbers, underscores only)
   if (!/^[a-z0-9_]+$/i.test(category)) 
   {
      alert("Category must be a valid identifier:\n- Letters (a-z, A-Z)\n- Numbers (0-9)\n- Underscores (_)\n\nNo spaces, hyphens, or special characters allowed.");
      document.getElementById("file-category").focus();
      return;
   }
   
   const fileName = `${priority}-${type}--${category}`;
   
   // Check if file already exists in ANY location (etc or share)
   const editorList = editors[currentAddFileType];
   const exists = editorList.find(e => e.file.name === fileName);
   if (exists) 
   {
      const location = exists.file.location === "share" ? "share (read-only)" : "etc";
      alert(`File "${fileName}" already exists in ${location}!\n\nPlease choose a different name.`);
      return;
   }
   
   // Close modal
   document.getElementById("add-file-modal").classList.remove("show");
   
   // Create new file in etc/
   const subdir = currentAddFileType === "ignore" ? "ignore.d" : "match.d";
   const etcDir = `${currentProjectPath}/.mulle/etc/match/${subdir}`;
   const filePath = `${etcDir}/${fileName}`;
   
   // Check if this is the first file being created in etc/ for this subdir
   const etcDirExists = await window.electronAPI.fileExists(etcDir);
   const needsSymlinkCreation = !etcDirExists.exists;
   
   const newFile = {
      name     : fileName,
      location : "etc",
      path     : filePath,
      isSymlink: false
   };
   
   // Create editor with empty content
   createEditor(newFile, "", currentAddFileType);
   
   // Mark as modified so it gets saved
   const editor = editorList.find(e => e.file.path === filePath);
   if (editor) 
   {
      editor.modified = true;
      editor.wrapper.querySelector(".editor-title").classList.add("modified");
   }
   
   // If this is the first file in etc/, we need to create symlinks to all share files
   if (needsSymlinkCreation) 
   {
      await createShareSymlinks(subdir);
   }
   
   // Sort editors by filename
   sortEditors(currentAddFileType);
   
   // Scroll to the new editor and focus it
   const newEditor = editorList.find(e => e.file.path === filePath);
   if (newEditor) 
   {
      newEditor.wrapper.scrollIntoView({
         behavior: "smooth",
         block   : "center" 
      });
      setTimeout(() => newEditor.textarea.focus(), 300);
   }
   
   console.log(`Created new file: ${fileName} in ${currentAddFileType}`);
}

async function createShareSymlinks(subdir) 
{
   console.log(`Creating symlinks to share files in ${subdir}...`);
   
   const sharePath = `${currentProjectPath}/.mulle/share/match/${subdir}`;
   
   // Check if share directory exists
   const shareExists = await window.electronAPI.fileExists(sharePath);
   if (!shareExists.exists) 
   {
      console.log(`  No share/${subdir} directory, skipping symlink creation`);
      return;
   }
   
   // Get all files in share
   const shareResult = await window.electronAPI.listDirectory(sharePath);
   if (!shareResult.success || shareResult.files.length === 0) 
   {
      console.log(`  No files in share/${subdir}, skipping symlink creation`);
      return;
   }
   
   const etcPath = `${currentProjectPath}/.mulle/etc/match/${subdir}`;
   
   // Create symlinks for all share files
   for (const filename of shareResult.files) 
   {
      const etcFilePath = `${etcPath}/${filename}`;
      const relativeTarget = `../../../share/match/${subdir}/${filename}`;
      
      // Check if file already exists in etc (shouldn't happen, but be safe)
      const exists = await window.electronAPI.fileExists(etcFilePath);
      if (exists.exists) 
      {
         console.log(`    ${filename}: already exists in etc/, skipping`);
         continue;
      }
      
      const symlinkResult = await window.electronAPI.createSymlink(relativeTarget, etcFilePath);
      if (symlinkResult.success) 
      {
         console.log(`    ✓ Created symlink: ${filename} -> share`);
      }
      else 
      {
         console.error(`    ✗ Failed to create symlink for ${filename}: ${symlinkResult.error}`);
      }
   }
}

function sortEditors(type) 
{
   const editorArea = type === "ignore" ? ignoreEditorArea : matchEditorArea;
   const editorList = editors[type];
   
   // Sort by filename
   editorList.sort((a, b) => a.file.name.localeCompare(b.file.name));
   
   // Re-append in sorted order (active editors only)
   editorArea.innerHTML = "";
   for (const editor of editorList) 
   {
      editorArea.appendChild(editor.wrapper);
   }
   
   // Append deleted editors at the end (if they exist)
   const deletedList = deletedEditors[type];
   deletedList.sort((a, b) => a.file.name.localeCompare(b.file.name));
   for (const editor of deletedList) 
   {
      editorArea.appendChild(editor.wrapper);
      // Apply visibility setting
      editor.wrapper.style.display = showDeletedFiles ? "" : "none";
   }
}

function deleteEditorFile(file, type) 
{
   const fileName = file.name;
   const fileType = file.isSymlink ? "symlink" : "file";
   const confirm = window.confirm(
      `Delete ${fileType} "${fileName}"?\n\n` +
      `This will remove the ${fileType} from etc/ on next save.`
   );
   
   if (!confirm) 
   {
      return;
   }
   
   // Find the editor
   const editorList = editors[type];
   const editor = editorList.find(e => e.file.path === file.path);
   
   if (!editor) 
   {
      alert("Could not find editor to delete");
      return;
   }
   
   // Mark as deleted (add red background and change header)
   editor.wrapper.classList.add("deleted");
   editor.deleted = true;
   
   // Change DELETE button to UNDELETE
   const deleteBtn = editor.wrapper.querySelector(".editor-delete-btn");
   if (deleteBtn) 
   {
      deleteBtn.textContent = "UNDELETE";
      deleteBtn.classList.add("undelete");
      deleteBtn.onclick = () => undeleteEditorFile(file, type);
   }
   
   // Remove from active editors list and add to deleted list
   const index = editorList.indexOf(editor);
   if (index >= 0) 
   {
      editorList.splice(index, 1);
   }
   deletedEditors[type].push(editor);
   
   // Mark for deletion (we'll delete on save)
   if (!window.filesToDelete) 
   {
      window.filesToDelete = [];
   }
   window.filesToDelete.push(file.path);
   
   // Update visibility based on show deleted flag
   updateDeletedFilesVisibility();
   
   console.log(`Marked for deletion: ${fileName}`);
}

function undeleteEditorFile(file, type) 
{
   const deletedList = deletedEditors[type];
   const editor = deletedList.find(e => e.file.path === file.path);
   
   if (!editor) 
   {
      alert("Could not find deleted editor");
      return;
   }
   
   // Remove deleted styling
   editor.wrapper.classList.remove("deleted");
   editor.deleted = false;
   
   // Change UNDELETE button back to DELETE
   const undeleteBtn = editor.wrapper.querySelector(".editor-delete-btn");
   if (undeleteBtn) 
   {
      undeleteBtn.textContent = "DELETE";
      undeleteBtn.classList.remove("undelete");
      undeleteBtn.onclick = () => deleteEditorFile(file, type);
   }
   
   // Move from deleted list back to active editors
   const index = deletedList.indexOf(editor);
   if (index >= 0) 
   {
      deletedList.splice(index, 1);
   }
   editors[type].push(editor);
   
   // Remove from deletion queue
   if (window.filesToDelete) 
   {
      const deleteIndex = window.filesToDelete.indexOf(file.path);
      if (deleteIndex >= 0) 
      {
         window.filesToDelete.splice(deleteIndex, 1);
      }
   }
   
   // Re-sort and ensure it's visible
   sortEditors(type);
   editor.wrapper.style.display = "";
   
   console.log(`Undeleted: ${file.name}`);
}

function updateDeletedFilesVisibility() 
{
   for (const type of ["ignore", "match"]) 
   {
      for (const editor of deletedEditors[type]) 
      {
         editor.wrapper.style.display = showDeletedFiles ? "" : "none";
      }
   }
}

async function revertToSaved() 
{
   if (!currentProjectPath) 
   {
      return;
   }
   
   // Count changes
   let modifiedCount = 0;
   const deletedCount = deletedEditors.ignore.length + deletedEditors.match.length;
   
   for (const editor of [...editors.ignore, ...editors.match]) 
   {
      if (editor.modified) 
      {
         modifiedCount++;
      }
   }
   
   if (modifiedCount === 0 && deletedCount === 0) 
   {
      alert("No unsaved changes to revert.");
      return;
   }
   
   const confirm = window.confirm(
      `Revert all changes?\n\n` +
      `This will discard:\n` +
      `- ${modifiedCount} modified file(s)\n` +
      `- ${deletedCount} deleted file(s)\n\n` +
      `This action cannot be undone.`
   );
   
   if (!confirm) 
   {
      return;
   }
   
   // Clear deletion queue
   window.filesToDelete = [];
   
   // Reload the entire project
   await loadProject(currentProjectPath);
   
   console.log("Reverted to saved state");
}

async function revertToDefaults() 
{
   if (!currentProjectPath) 
   {
      return;
   }
   
   // Count files in etc/
   let etcIgnoreCount = 0;
   let etcMatchCount = 0;
   
   for (const editor of editors.ignore) 
   {
      if (editor.file.location === "etc") 
      {
         etcIgnoreCount++;
      }
   }
   
   for (const editor of editors.match) 
   {
      if (editor.file.location === "etc") 
      {
         etcMatchCount++;
      }
   }
   
   // Add deleted files that were in etc/
   for (const editor of deletedEditors.ignore) 
   {
      if (editor.file.location === "etc") 
      {
         etcIgnoreCount++;
      }
   }
   
   for (const editor of deletedEditors.match) 
   {
      if (editor.file.location === "etc") 
      {
         etcMatchCount++;
      }
   }
   
   const totalEtcFiles = etcIgnoreCount + etcMatchCount;
   
   if (totalEtcFiles === 0) 
   {
      alert("No custom overrides found.\n\nYou are already using the defaults from share/.");
      return;
   }
   
   const confirm = window.confirm(
      `⚠️  REVERT TO DEFAULTS  ⚠️\n\n` +
      `This will DELETE ALL custom pattern files in etc/:\n\n` +
      `- ${etcIgnoreCount} ignore pattern file(s)\n` +
      `- ${etcMatchCount} match pattern file(s)\n\n` +
      `After this, you will ONLY have the shared defaults from share/.\n\n` +
      `What this means:\n` +
      `• All files in .mulle/etc/match/ will be PERMANENTLY DELETED\n` +
      `• You will lose all custom pattern configurations\n` +
      `• You will revert to the project's default patterns\n` +
      `• Any unsaved changes will also be lost\n\n` +
      `This action CANNOT be undone!\n\n` +
      `Are you absolutely sure?`
   );
   
   if (!confirm) 
   {
      return;
   }
   
   // Double confirmation for safety
   const finalConfirm = window.confirm(
      `FINAL CONFIRMATION\n\n` +
      `You are about to delete ${totalEtcFiles} custom pattern file(s).\n\n` +
      `Type or think "yes" to proceed...`
   );
   
   if (!finalConfirm) 
   {
      console.log("Revert to defaults cancelled by user");
      return;
   }
   
   try 
   {
      console.log("=== Reverting to Defaults ===");
      
      // Remove etc/match directories
      const etcMatchPath = `${currentProjectPath}/.mulle/etc/match`;
      const etcMatchExists = await window.electronAPI.fileExists(etcMatchPath);
      
      if (etcMatchExists.exists) 
      {
         const ignoreDir = `${etcMatchPath}/ignore.d`;
         const matchDir = `${etcMatchPath}/match.d`;
         
         // Remove ignore.d directory
         const ignoreDirExists = await window.electronAPI.fileExists(ignoreDir);
         if (ignoreDirExists.exists) 
         {
            const result = await window.electronAPI.removeDirectory(ignoreDir);
            if (result.success) 
            {
               console.log(`  ✓ Removed ${ignoreDir}`);
            }
            else 
            {
               console.error(`  ✗ Failed to remove ${ignoreDir}: ${result.error}`);
            }
         }
         
         // Remove match.d directory
         const matchDirExists = await window.electronAPI.fileExists(matchDir);
         if (matchDirExists.exists) 
         {
            const result = await window.electronAPI.removeDirectory(matchDir);
            if (result.success) 
            {
               console.log(`  ✓ Removed ${matchDir}`);
            }
            else 
            {
               console.error(`  ✗ Failed to remove ${matchDir}: ${result.error}`);
            }
         }
         
         // Try to remove parent directory if it's empty
         const dirList = await window.electronAPI.listDirectory(etcMatchPath);
         if (dirList.success && dirList.files.length === 0) 
         {
            await window.electronAPI.removeDirectory(etcMatchPath);
            console.log(`  ✓ Removed empty parent directory`);
         }
      }
      
      console.log("=== Revert to Defaults Complete ===");
      alert("Successfully reverted to defaults!\n\nAll custom overrides have been removed.\nYou are now using the shared default patterns.");
      
      // Reload project to show only share/ files
      await loadProject(currentProjectPath);
   }
   catch (err) 
   {
      console.error("Revert to defaults failed:", err);
      alert("Failed to revert to defaults: " + err.message);
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
   
   // Use the new deleteEditorFile function
   deleteEditorFile(targetEditor.file, targetType);
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

// Add file modal handlers
document.getElementById("close-add-file-modal").addEventListener("click", () => 
{
   document.getElementById("add-file-modal").classList.remove("show");
});

document.getElementById("cancel-add-file").addEventListener("click", () => 
{
   document.getElementById("add-file-modal").classList.remove("show");
});

document.getElementById("confirm-add-file").addEventListener("click", () => 
{
   createNewFile();
});

// Update filename preview as user types
document.getElementById("file-priority").addEventListener("input", (e) => 
{
   // Only allow digits
   e.target.value = e.target.value.replace(/[^0-9]/g, "");
   
   // Auto-pad with leading zero if only one digit entered
   if (e.target.value.length === 1 && e.data) 
   {
      const num = parseInt(e.target.value);
      if (num >= 0 && num <= 9) 
      {
         e.target.value = "0" + e.target.value;
      }
   }
   
   updateFilenamePreview();
});

document.getElementById("file-type").addEventListener("input", (e) => 
{
   // Only allow letters, numbers, underscores
   e.target.value = e.target.value.replace(/[^a-zA-Z0-9_]/g, "");
   updateFilenamePreview();
});

document.getElementById("file-category").addEventListener("input", (e) => 
{
   // Only allow letters, numbers, underscores
   e.target.value = e.target.value.replace(/[^a-zA-Z0-9_]/g, "");
   updateFilenamePreview();
});

// Allow Enter key to submit in modal
document.getElementById("file-priority").addEventListener("keypress", (e) => 
{
   if (e.key === "Enter") 
   {
      document.getElementById("file-type").focus();
   }
});

document.getElementById("file-type").addEventListener("keypress", (e) => 
{
   if (e.key === "Enter") 
   {
      document.getElementById("file-category").focus();
   }
});

document.getElementById("file-category").addEventListener("keypress", (e) => 
{
   if (e.key === "Enter") 
   {
      createNewFile();
   }
});

// Doctor functionality
async function runDoctor() 
{
   if (!currentProjectPath) 
   {
      alert("No project loaded. Open a project first.");
      return;
   }
   
   const modal = document.getElementById("doctor-modal");
   const resultsEl = document.getElementById("doctor-results");
   
   resultsEl.innerHTML = '<div class="doctor-running">Running diagnostics...</div>';
   modal.classList.add("show");
   
   try 
   {
      const report = await window.electronAPI.runDoctor(currentProjectPath);
      
      let html = "";
      
      // Cache directory info
      if (!report.cacheDir) 
      {
         html += '<div class="doctor-section">';
         html += '<div class="doctor-ok">✓ No cache directory found — nothing to clean.</div>';
         html += '</div>';
      }
      else 
      {
         html += '<div class="doctor-section">';
         html += `<div class="doctor-label">Cache directory</div>`;
         html += `<div class="doctor-value">${report.cacheDir}</div>`;
         html += `<div class="doctor-stats">${report.cacheFiles.length} cache entries, ${report.patternFiles.length} pattern files</div>`;
         html += '</div>';
         
         // Stale entries
         if (report.staleEntries.length === 0) 
         {
            html += '<div class="doctor-section">';
            html += '<div class="doctor-ok">✓ All cache entries are up-to-date.</div>';
            html += '</div>';
         }
         else 
         {
            html += '<div class="doctor-section">';
            html += `<div class="doctor-warn">⚠ Found ${report.staleEntries.length} stale cache entries:</div>`;
            html += '<div class="doctor-entries">';
            
            for (const entry of report.staleEntries) 
            {
               let icon;
               let cssClass;
               
               if (entry.reason === "stale") 
               {
                  icon = "⏰";
                  cssClass = "doctor-entry-stale";
               }
               else if (entry.reason === "missing") 
               {
                  icon = "❌";
                  cssClass = "doctor-entry-missing";
               }
               else 
               {
                  icon = "👻";
                  cssClass = "doctor-entry-orphaned";
               }
               
               html += `<div class="doctor-entry ${cssClass}">`;
               html += `<span class="doctor-entry-icon">${icon}</span>`;
               html += `<span class="doctor-entry-name">${entry.patternFile}</span>`;
               
               if (entry.location !== "cache" && entry.subdir) 
               {
                  html += `<span class="doctor-entry-location">${entry.location}/${entry.subdir}</span>`;
               }
               
               html += `<div class="doctor-entry-detail">${entry.detail}</div>`;
               html += '</div>';
            }
            
            html += '</div>';
            html += '</div>';
         }
         
         // Clean result
         html += '<div class="doctor-section">';
         if (report.cleaned) 
         {
            html += '<div class="doctor-ok">✓ Cache cleaned successfully.</div>';
         }
         else 
         {
            html += `<div class="doctor-error">✗ Failed to clean cache: ${report.error || "unknown error"}</div>`;
         }
         html += '</div>';
      }
      
      if (report.error && !report.cacheDir) 
      {
         html += `<div class="doctor-section"><div class="doctor-error">✗ Error: ${report.error}</div></div>`;
      }
      
      resultsEl.innerHTML = html;
   }
   catch (err) 
   {
      resultsEl.innerHTML = `<div class="doctor-error">✗ Doctor failed: ${err.message}</div>`;
   }
}

document.getElementById("close-doctor-modal").addEventListener("click", () => 
{
   document.getElementById("doctor-modal").classList.remove("show");
});

document.getElementById("dismiss-doctor").addEventListener("click", () => 
{
   document.getElementById("doctor-modal").classList.remove("show");
});

// Cleanup on window close
window.addEventListener("beforeunload", async () => 
{
   if (tempDirectory) 
   {
      await window.electronAPI.cleanupTempDirectory(tempDirectory);
   }
});
