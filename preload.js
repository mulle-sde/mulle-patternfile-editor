const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
   // Menu event listeners
   onMenuOpen      : (callback) => ipcRenderer.on("menu-open", callback),
   onMenuSave      : (callback) => ipcRenderer.on("menu-save", callback),
   onMenuAddFile   : (callback) => ipcRenderer.on("menu-add-file", callback),
   onMenuDeleteFile: (callback) => ipcRenderer.on("menu-delete-file", callback),
   
   // Dialog handlers
   openDirectoryDialog: () => ipcRenderer.invoke("open-directory-dialog"),
   
   // Project operations
   validateProject : (projectPath) => ipcRenderer.invoke("validate-project", projectPath),
   scanPatternFiles: (projectPath) => ipcRenderer.invoke("scan-pattern-files", projectPath),
   readFile        : (filePath) => ipcRenderer.invoke("read-file", filePath),
   
   // Preview operations
   createTempDirectory : () => ipcRenderer.invoke("create-temp-directory"),
   writeTempFile       : (tempDir, subdir, filename, content) => ipcRenderer.invoke("write-temp-file", tempDir, subdir, filename, content),
   runMulleMatch       : (projectPath, tempDir, envVars) => ipcRenderer.invoke("run-mulle-match", projectPath, tempDir, envVars),
   cleanupTempDirectory: (tempDir) => ipcRenderer.invoke("cleanup-temp-directory", tempDir),
   
   // Environment operations
   getMulleEnv: (projectPath, keyName) => ipcRenderer.invoke("get-mulle-env", projectPath, keyName),
   setMulleEnv: (projectPath, keyName, value) => ipcRenderer.invoke("set-mulle-env", projectPath, keyName, value),
   
   // File operations for saving
   writePatternFile     : (filePath, content) => ipcRenderer.invoke("write-pattern-file", filePath, content),
   readPatternFile      : (filePath) => ipcRenderer.invoke("read-pattern-file", filePath),
   createSymlink        : (target, linkPath) => ipcRenderer.invoke("create-symlink", target, linkPath),
   removeFile           : (filePath) => ipcRenderer.invoke("remove-file", filePath),
   listDirectory        : (dirPath) => ipcRenderer.invoke("list-directory", dirPath),
   removeDirectory      : (dirPath) => ipcRenderer.invoke("remove-directory", dirPath),
   fileExists           : (filePath) => ipcRenderer.invoke("file-exists", filePath),
   createCraftDirectory : (projectPath) => ipcRenderer.invoke("create-craft-directory", projectPath),
   
   // Recent projects
   getRecentProjects  : () => ipcRenderer.invoke("get-recent-projects"),
   addRecentProject   : (projectPath) => ipcRenderer.invoke("add-recent-project", projectPath),
   onOpenRecentProject: (callback) => ipcRenderer.on("open-recent-project", (event, projectPath) => callback(projectPath)),
   
   // Preferences
   getPreferences   : () => ipcRenderer.invoke("get-preferences"),
   setPreferences   : (prefs) => ipcRenderer.invoke("set-preferences", prefs),
   onMenuPreferences: (callback) => ipcRenderer.on("menu-preferences", callback),
});
