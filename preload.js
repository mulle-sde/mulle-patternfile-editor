const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
   // Menu event listeners
   onMenuOpen: (callback) => ipcRenderer.on("menu-open", callback),
   onMenuSave: (callback) => ipcRenderer.on("menu-save", callback),
   onMenuAddFile: (callback) => ipcRenderer.on("menu-add-file", callback),
   onMenuDeleteFile: (callback) => ipcRenderer.on("menu-delete-file", callback),
   
   // Dialog handlers
   openDirectoryDialog: () => ipcRenderer.invoke("open-directory-dialog"),
   
   // Project operations
   validateProject: (projectPath) => ipcRenderer.invoke("validate-project", projectPath),
   scanPatternFiles: (projectPath) => ipcRenderer.invoke("scan-pattern-files", projectPath),
   readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
   
   // Preview operations
   createTempDirectory: () => ipcRenderer.invoke("create-temp-directory"),
   writeTempFile: (tempDir, subdir, filename, content) => ipcRenderer.invoke("write-temp-file", tempDir, subdir, filename, content),
   runMulleMatch: (projectPath, tempDir, envVars) => ipcRenderer.invoke("run-mulle-match", projectPath, tempDir, envVars),
   cleanupTempDirectory: (tempDir) => ipcRenderer.invoke("cleanup-temp-directory", tempDir),
   
   // Environment operations
   getMulleEnv: (projectPath, keyName) => ipcRenderer.invoke("get-mulle-env", projectPath, keyName),
   setMulleEnv: (projectPath, keyName, value) => ipcRenderer.invoke("set-mulle-env", projectPath, keyName, value),
});
