const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const { exec } = require("child_process");
const os = require("os");

let mainWindow;
let hasEtcFiles = false;

async function createWindow()
{
   let windowState = {
      width : 1400,
      height: 900,
      x     : undefined,
      y     : undefined,
   };

   try 
   {
      const stateData = await fs.readFile(
         path.join(app.getPath("userData"), "window-state.json"),
         "utf-8",
      );
      windowState = JSON.parse(stateData);
   }
   catch (_err) 
   {
      // File doesn't exist or invalid, use defaults
   }

   mainWindow = new BrowserWindow({
      width         : windowState.width || 1400,
      height        : windowState.height || 900,
      x             : windowState.x,
      y             : windowState.y,
      title         : "mulle-patternfile Editor",
      icon          : path.join(__dirname, "icon.png"),
      webPreferences: {
         preload         : path.join(__dirname, "preload.js"),
         contextIsolation: true,
         nodeIntegration : false,
      },
   });

   mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => 
   {
      const prefixes = ["[VERBOSE]", "[INFO]", "[WARN]", "[ERROR]"];
      const prefix   = prefixes[level] ?? "[LOG]";
      const out = console[ ["log","log","warn","error"][level] ] || console.log;
      out(`${prefix} [Renderer:${path.basename(sourceId)}:${line}] ${message}`);
   });

   mainWindow.on("close", () => 
   {
      const bounds = mainWindow.getBounds();
      fs.writeFile(
         path.join(app.getPath("userData"), "window-state.json"),
         JSON.stringify(bounds),
         "utf-8",
      ).catch((err) => console.error("Failed to save window state:", err));
   });

   mainWindow.loadFile("index.html");

   if (process.argv.includes("--inspect"))
   {
      mainWindow.webContents.openDevTools({ mode: "detach" });
   }

   createMenu();
}

async function updateRecentFilesMenu() 
{
   const menu = Menu.getApplicationMenu();
   if (menu) 
   {
      createMenu();
   }
}

function formatRecentPath(dirPath) 
{
   const parts = dirPath.split(path.sep);
   if (parts.length >= 2) 
   {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
   }
   return path.basename(dirPath);
}

async function createMenu() 
{
   let recentProjects = [];
   try 
   {
      const recentsPath = path.join(app.getPath("userData"), "recent-projects.json");
      const data = await fs.readFile(recentsPath, "utf-8");
      recentProjects = JSON.parse(data);
   }
   catch (err) 
   {
      // No recent projects
   }

   const recentProjectsSubmenu =
    recentProjects.length > 0
       ? recentProjects.map((projectPath) => ({
          label: formatRecentPath(projectPath),
          click: async () => 
          {
             try 
             {
                mainWindow.webContents.send("open-recent-project", projectPath);
             }
             catch (err) 
             {
                dialog.showErrorBox(
                   "Error",
                   `Could not open: ${err.message}`,
                );
             }
          },
       }))
       : [{
          label  : "No recent projects",
          enabled: false 
       }];

   const template = [
      {
         label  : "File",
         submenu: [
            {
               label      : "Open Project...",
               accelerator: "CmdOrCtrl+O",
               click      : () => mainWindow.webContents.send("menu-open"),
            },
            {
               label  : "Open Recent",
               submenu: recentProjectsSubmenu,
            },
            {
               label      : "Save All",
               accelerator: "CmdOrCtrl+S",
               click      : () => mainWindow.webContents.send("menu-save"),
            },
            {
               label      : "Revert to Saved",
               accelerator: "CmdOrCtrl+R",
               click      : () => mainWindow.webContents.send("menu-revert"),
            },
            {
               label      : "Revert to Defaults",
               accelerator: "CmdOrCtrl+Shift+R",
               enabled    : hasEtcFiles,
               click      : () => mainWindow.webContents.send("menu-revert-defaults"),
            },
            { type: "separator" },
            {
               label      : "Exit",
               accelerator: "CmdOrCtrl+Q",
               click      : () => app.quit(),
            },
         ],
      },
      {
         label  : "Edit",
         submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "delete" },
            { type: "separator" },
            { role: "selectAll" },
            { type: "separator" },
            {
               label      : "Add File",
               accelerator: "CmdOrCtrl+N",
               click      : () => mainWindow.webContents.send("menu-add-file"),
            },
            {
               label      : "Delete File",
               accelerator: "CmdOrCtrl+Backspace",
               click      : () => mainWindow.webContents.send("menu-delete-file"),
            },
         ],
      },
      {
         label  : "View",
         submenu: [
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { type: "separator" },
            { role: "togglefullscreen" },
            { type: "separator" },
            {
               label  : "Show Deleted Files",
               type   : "checkbox",
               checked: false,
               click  : (menuItem) => mainWindow.webContents.send("menu-toggle-deleted", menuItem.checked),
            },
            { type: "separator" },
            {
               label      : "Preferences…",
               accelerator: "CmdOrCtrl+,",
               click      : () => mainWindow.webContents.send("menu-preferences"),
            },
         ],
      },
      {
         label  : "Tools",
         submenu: [
            {
               label      : "Doctor",
               accelerator: "CmdOrCtrl+Shift+D",
               click      : () => mainWindow.webContents.send("menu-doctor"),
            },
         ],
      },
      {
         label  : "Help",
         submenu: [
            {
               label: "About",
               click: () => 
               {
                  dialog.showMessageBox(mainWindow, {
                     type   : "info",
                     title  : "About mulle-patternfile Editor",
                     message: "mulle-patternfile Editor",
                     detail : `Version: ${app.getVersion()}\n\nEditor for mulle-match pattern files\n\n© Mulle kybernetiK\nnat@mulle-kybernetik.com\n\nhttps://github.com/mulle-sde`,
                  });
               },
            },
         ],
      },
   ];

   const menu = Menu.buildFromTemplate(template);
   Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => 
{
   await createWindow();

   // Find arguments after "--" separator (passed from cli.js)
   const separatorIndex = process.argv.indexOf("--");
   const projectArg = separatorIndex !== -1 && process.argv[separatorIndex + 1] 
      ? process.argv[separatorIndex + 1] 
      : null;

   if (projectArg && mainWindow) 
   {
      const projectPath = path.resolve(projectArg);
      mainWindow.webContents.on("did-finish-load", () => 
      {
         setTimeout(() => 
         {
            mainWindow.webContents.send("open-project-path", projectPath);
         }, 500);
      });
   }
});

app.on("window-all-closed", () => 
{
   if (process.platform !== "darwin")
   {
      app.quit();
   }
});

app.on("activate", () => 
{
   if (BrowserWindow.getAllWindows().length === 0)
   {
      createWindow();
   }
});

// IPC handlers
ipcMain.handle("open-directory-dialog", async () => 
{
   const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"]
   });
   return result;
});

ipcMain.handle("validate-project", async (event, projectPath) => 
{
   try 
   {
      const mullePath = path.join(projectPath, ".mulle");
      const stats = await fs.stat(mullePath);
      return { valid: stats.isDirectory() };
   }
   catch (err) 
   {
      return {
         valid: false,
         error: "No .mulle folder found" 
      };
   }
});

ipcMain.handle("scan-pattern-files", async (event, projectPath) => 
{
   const result = {
      ignoreFiles: [],
      matchFiles : []
   };

   const paths = [
      {
         base    : path.join(projectPath, ".mulle/etc/match"),
         location: "etc" 
      },
      {
         base    : path.join(projectPath, ".mulle/share/match"),
         location: "share" 
      }
   ];

   for (const { base, location } of paths) 
   {
      // Scan ignore.d
      const ignorePath = path.join(base, "ignore.d");
      try 
      {
         const files = await fs.readdir(ignorePath);
         for (const file of files) 
         {
            const filePath = path.join(ignorePath, file);
            try 
            {
               const stats = await fs.lstat(filePath);
               result.ignoreFiles.push({
                  name     : file,
                  location,
                  path     : filePath,
                  isSymlink: stats.isSymbolicLink()
               });
            }
            catch (err) 
            {
               // Skip files we can't stat
            }
         }
      }
      catch (err) 
      {
         // Directory doesn't exist, skip
      }

      // Scan match.d
      const matchPath = path.join(base, "match.d");
      try 
      {
         const files = await fs.readdir(matchPath);
         for (const file of files) 
         {
            const filePath = path.join(matchPath, file);
            try 
            {
               const stats = await fs.lstat(filePath);
               result.matchFiles.push({
                  name     : file,
                  location,
                  path     : filePath,
                  isSymlink: stats.isSymbolicLink()
               });
            }
            catch (err) 
            {
               // Skip files we can't stat
            }
         }
      }
      catch (err) 
      {
         // Directory doesn't exist, skip
      }
   }

   return result;
});

ipcMain.handle("read-file", async (event, filePath) => 
{
   try 
   {
      const content = await fs.readFile(filePath, "utf-8");
      return {
         success: true,
         content 
      };
   }
   catch (err) 
   {
      return {
         success: false,
         error  : err.message 
      };
   }
});

ipcMain.handle("create-temp-directory", async () => 
{
   try 
   {
      const tempDir = path.join(os.tmpdir(), `mulle-patternfile-editor-${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });
      await fs.mkdir(path.join(tempDir, "match.d"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "ignore.d"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "cache"), { recursive: true });
      return {
         success: true,
         path   : tempDir 
      };
   }
   catch (err) 
   {
      return {
         success: false,
         error  : err.message 
      };
   }
});

ipcMain.handle("write-temp-file", async (event, tempDir, subdir, filename, content) => 
{
   try 
   {
      const filePath = path.join(tempDir, subdir, filename);
      await fs.writeFile(filePath, content, "utf-8");
      return { success: true };
   }
   catch (err) 
   {
      return {
         success: false,
         error  : err.message 
      };
   }
});

function buildEnvFlags(envVars)
{
   let envFlags = "";
   for (const [key, value] of Object.entries(envVars)) 
   {
      if (value) 
      {
         const escapedValue = value.replace(/'/g, "'\\''");
         envFlags += ` -D${key}='${escapedValue}'`;
      }
   }
   return envFlags;
}

ipcMain.handle("run-mulle-match", async (event, projectPath, tempDir, envVars = {}) => 
{
   return new Promise((resolve) => 
   {
      const cacheDir = path.join(tempDir, "cache");
      
      // Build -D flags for environment variables
      // Use single quotes to prevent premature shell expansion
      const envFlags = buildEnvFlags(envVars);
      
      const command = `cd "${projectPath}" && mulle-sde${envFlags} exec mulle-match --root-dir "${tempDir}" --cache-dir "${cacheDir}" list -f '%C: %f\\n' | column -t`;
      
      console.log("Running command:", command);
      
      exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => 
      {
         if (error) 
         {
            resolve({ 
               success: false, 
               error  : error.message,
               stderr : stderr 
            });
         }
         else 
         {
            const lines = stdout.trim().split("\n").filter(f => f.length > 0);
            resolve({ 
               success: true, 
               files  : lines,
               count  : lines.length 
            });
         }
      });
   });
});

ipcMain.handle("evaluate-env-vars", async (event, projectPath) => 
{
   return new Promise((resolve) => 
   {
      const keys = ["MULLE_MATCH_FILENAMES", "MULLE_MATCH_IGNORE_PATH", "MULLE_MATCH_PATH"];
      const result = {};
      let completed = 0;
      
      for (const key of keys) 
      {
         const command = `cd "${projectPath}" && mulle-sde get --output-eval ${key}`;
         
         exec(command, { timeout: 5000 }, (error, stdout) =>
         {
            // On error (e.g. variable not set, exit code 4), treat as empty
            result[key] = error ? "" : stdout.trim();
            
            completed++;
            if (completed === keys.length) 
            {
               resolve({ success: true, values: result });
            }
         });
      }
   });
});

ipcMain.handle("cleanup-temp-directory", async (event, tempDir) => 
{
   try 
   {
      await fs.rm(tempDir, {
         recursive: true,
         force    : true 
      });
      return { success: true };
   }
   catch (err) 
   {
      return {
         success: false,
         error  : err.message 
      };
   }
});

async function addToRecentProjects(projectPath) 
{
   try 
   {
      const recentsPath = path.join(app.getPath("userData"), "recent-projects.json");
      let recents = [];
      
      try 
      {
         const data = await fs.readFile(recentsPath, "utf-8");
         recents = JSON.parse(data);
      }
      catch (err) 
      {
         // File doesn't exist yet
      }

      recents = recents.filter((f) => f !== projectPath);
      recents.unshift(projectPath);
      recents = recents.slice(0, 10);

      await fs.writeFile(recentsPath, JSON.stringify(recents), "utf-8");

      updateRecentFilesMenu();
   }
   catch (err) 
   {
      console.error("Failed to update recent projects:", err);
   }
}

ipcMain.handle("get-recent-projects", async () => 
{
   try 
   {
      const recentsPath = path.join(app.getPath("userData"), "recent-projects.json");
      const data = await fs.readFile(recentsPath, "utf-8");
      return JSON.parse(data);
   }
   catch (err) 
   {
      return [];
   }
});

ipcMain.handle("add-recent-project", async (event, projectPath) => 
{
   await addToRecentProjects(projectPath);
});

ipcMain.handle("get-preferences", async () => 
{
   try 
   {
      const prefsPath = path.join(app.getPath("userData"), "preferences.json");
      const data = await fs.readFile(prefsPath, "utf-8");
      return JSON.parse(data);
   }
   catch (err) 
   {
      return { showBadges: false }; // Default: hide badges
   }
});

ipcMain.handle("set-preferences", async (event, prefs) => 
{
   try 
   {
      const prefsPath = path.join(app.getPath("userData"), "preferences.json");
      await fs.writeFile(prefsPath, JSON.stringify(prefs), "utf-8");
      return { success: true };
   }
   catch (err) 
   {
      return {
         success: false,
         error  : err.message 
      };
   }
});

ipcMain.handle("get-mulle-env", async (event, projectPath, keyName) => 
{
   return new Promise((resolve) => 
   {
      const command = `cd "${projectPath}" && mulle-env get ${keyName}`;
      
      console.log("Running command:", command);
      
      exec(command, (error, stdout) => 
      {
         if (error) 
         {
            resolve({
               success: false,
               error  : error.message,
               value  : "" 
            });
         }
         else 
         {
            resolve({
               success: true,
               value  : stdout.trim() 
            });
         }
      });
   });
});

ipcMain.handle("set-mulle-env", async (event, projectPath, keyName, value) => 
{
   return new Promise((resolve) => 
   {
      // Escape the value properly for shell - use single quotes to prevent expansion
      const escapedValue = value.replace(/'/g, "'\\''");
      const command = `cd "${projectPath}" && mulle-env set ${keyName} '${escapedValue}'`;
      
      console.log("Running command:", command);
      
      exec(command, (error) => 
      {
         if (error) 
         {
            resolve({
               success: false,
               error  : error.message 
            });
         }
         else 
         {
            resolve({ success: true });
         }
      });
   });
});

ipcMain.handle("write-pattern-file", async (event, filePath, content) => 
{
   try 
   {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(filePath, content, "utf-8");
      return { success: true };
   }
   catch (err) 
   {
      return {
         success: false,
         error  : err.message 
      };
   }
});

ipcMain.handle("read-pattern-file", async (event, filePath) => 
{
   try 
   {
      const content = await fs.readFile(filePath, "utf-8");
      return {
         success: true,
         content 
      };
   }
   catch (err) 
   {
      return {
         success: false,
         error  : err.message 
      };
   }
});

ipcMain.handle("create-symlink", async (event, target, linkPath) => 
{
   try 
   {
      // Ensure directory exists
      const dir = path.dirname(linkPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Remove existing file/symlink if it exists
      try 
      {
         await fs.unlink(linkPath);
      }
      catch (err) 
      {
         // File doesn't exist, that's fine
      }
      
      await fs.symlink(target, linkPath);
      return { success: true };
   }
   catch (err) 
   {
      return {
         success: false,
         error  : err.message 
      };
   }
});

ipcMain.handle("remove-file", async (event, filePath) => 
{
   try 
   {
      await fs.unlink(filePath);
      return { success: true };
   }
   catch (err) 
   {
      return {
         success: false,
         error  : err.message 
      };
   }
});

ipcMain.handle("list-directory", async (event, dirPath) => 
{
   try 
   {
      const files = await fs.readdir(dirPath);
      return {
         success: true,
         files 
      };
   }
   catch (err) 
   {
      return {
         success: false,
         files  : [],
         error  : err.message 
      };
   }
});

ipcMain.handle("remove-directory", async (event, dirPath) => 
{
   try 
   {
      await fs.rm(dirPath, {
         recursive: true,
         force    : true 
      });
      return { success: true };
   }
   catch (err) 
   {
      return {
         success: false,
         error  : err.message 
      };
   }
});

ipcMain.handle("file-exists", async (event, filePath) => 
{
   try 
   {
      await fs.access(filePath);
      return { exists: true };
   }
   catch (err) 
   {
      return { exists: false };
   }
});

ipcMain.handle("update-menu-state", async (event, state) => 
{
   hasEtcFiles = state.hasEtcFiles || false;
   await createMenu();
   return { success: true };
});

async function findCacheDirectory(projectPath)
{
   const varPath = path.join(projectPath, ".mulle", "var");
   
   async function searchDir(dir)
   {
      try 
      {
         const entries = await fs.readdir(dir, { withFileTypes: true });
         for (const entry of entries) 
         {
            if (!entry.isDirectory()) 
            {
               continue;
            }
            const fullPath = path.join(dir, entry.name);
            if (entry.name === "cache") 
            {
               // Check if parent is "match"
               if (path.basename(dir) === "match") 
               {
                  return fullPath;
               }
            }
            const found = await searchDir(fullPath);
            if (found) 
            {
               return found;
            }
         }
      }
      catch (err) 
      {
         // Directory doesn't exist or can't be read
      }
      return null;
   }
   
   return searchDir(varPath);
}

ipcMain.handle("run-doctor", async (event, projectPath) => 
{
   const report = {
      cacheDir    : null,
      cacheFiles  : [],
      patternFiles: [],
      staleEntries: [],
      cleaned     : false,
      error       : null
   };
   
   try 
   {
      // Step 1: Find cache directory
      const cacheDir = await findCacheDirectory(projectPath);
      if (!cacheDir) 
      {
         report.cacheDir = null;
         report.cleaned = true; // Nothing to clean
         return report;
      }
      report.cacheDir = cacheDir;
      
      // Step 2: Collect cache files with timestamps
      const cacheEntries = await fs.readdir(cacheDir);
      for (const name of cacheEntries) 
      {
         const filePath = path.join(cacheDir, name);
         try 
         {
            const stats = await fs.stat(filePath);
            if (stats.isFile()) 
            {
               report.cacheFiles.push({
                  name,
                  path : filePath,
                  mtime: stats.mtimeMs
               });
            }
         }
         catch (err) 
         {
            // Skip files we can't stat
         }
      }
      
      // Step 3: Collect all pattern files with timestamps
      const subdirs = ["ignore.d", "match.d"];
      const locations = [
         { base: path.join(projectPath, ".mulle", "etc", "match"), location: "etc" },
         { base: path.join(projectPath, ".mulle", "share", "match"), location: "share" }
      ];
      
      for (const { base, location } of locations) 
      {
         for (const subdir of subdirs) 
         {
            const dirPath = path.join(base, subdir);
            try 
            {
               const files = await fs.readdir(dirPath);
               for (const name of files) 
               {
                  const filePath = path.join(dirPath, name);
                  try 
                  {
                     // Use stat (not lstat) to follow symlinks and get real file mtime
                     const stats = await fs.stat(filePath);
                     const lstats = await fs.lstat(filePath);
                     report.patternFiles.push({
                        name,
                        path     : filePath,
                        location,
                        subdir,
                        isSymlink: lstats.isSymbolicLink(),
                        mtime    : stats.mtimeMs
                     });
                  }
                  catch (err) 
                  {
                     // Skip
                  }
               }
            }
            catch (err) 
            {
               // Directory doesn't exist
            }
         }
      }
      
      // Step 4: Map cache filenames back to pattern filenames and compare
      // Cache naming: `60-asset--toc` -> `__p__i_60_asset__toc`
      // Reverse: strip `__p__i_` prefix, replace `_` with `-`, but `__` stays as `--`
      // Actually, let's map pattern -> cache name instead (forward is easier)
      const patternToCacheName = (name) => 
      {
         return "__p__i_" + name.replace(/-/g, "_");
      };
      
      // Build a map of cache files by name for quick lookup
      const cacheMap = new Map();
      for (const cacheFile of report.cacheFiles) 
      {
         cacheMap.set(cacheFile.name, cacheFile);
      }
      
      // Use effective pattern files (etc/ overrides share/ for same name+subdir)
      const effectiveFiles = new Map();
      // Add share first, then etc overrides
      for (const pf of report.patternFiles) 
      {
         if (pf.location === "share") 
         {
            effectiveFiles.set(`${pf.subdir}/${pf.name}`, pf);
         }
      }
      for (const pf of report.patternFiles) 
      {
         if (pf.location === "etc") 
         {
            effectiveFiles.set(`${pf.subdir}/${pf.name}`, pf);
         }
      }
      
      for (const pf of effectiveFiles.values()) 
      {
         const expectedCacheName = patternToCacheName(pf.name);
         const cacheFile = cacheMap.get(expectedCacheName);
         
         if (!cacheFile) 
         {
            report.staleEntries.push({
               patternFile: pf.name,
               location   : pf.location,
               subdir     : pf.subdir,
               reason     : "missing",
               detail     : "No cache entry found"
            });
         }
         else if (pf.mtime > cacheFile.mtime) 
         {
            const patternDate = new Date(pf.mtime).toLocaleString();
            const cacheDate = new Date(cacheFile.mtime).toLocaleString();
            report.staleEntries.push({
               patternFile: pf.name,
               location   : pf.location,
               subdir     : pf.subdir,
               reason     : "stale",
               detail     : `Pattern: ${patternDate}  >  Cache: ${cacheDate}`
            });
         }
      }
      
      // Also check for orphaned cache files (cache entries without pattern files)
      const allExpectedCacheNames = new Set();
      for (const pf of effectiveFiles.values()) 
      {
         allExpectedCacheNames.add(patternToCacheName(pf.name));
      }
      
      for (const cacheFile of report.cacheFiles) 
      {
         if (!allExpectedCacheNames.has(cacheFile.name)) 
         {
            report.staleEntries.push({
               patternFile: cacheFile.name,
               location   : "cache",
               subdir     : "",
               reason     : "orphaned",
               detail     : "Cache entry has no matching pattern file"
            });
         }
      }
      
      // Step 5: Clean the cache with mulle-match clean
      await new Promise((resolve) => 
      {
         exec(`cd "${projectPath}" && mulle-match clean`, { timeout: 10000 }, (error) => 
         {
            report.cleaned = !error;
            if (error) 
            {
               report.error = error.message;
            }
            resolve();
         });
      });
   }
   catch (err) 
   {
      report.error = err.message;
   }
   
   return report;
});

ipcMain.handle("create-craft-directory", async (event, projectPath) => 
{
   try 
   {
      const craftPath = path.join(projectPath, ".mulle/etc/craft");
      await fs.mkdir(path.join(craftPath, "match.d"), { recursive: true });
      await fs.mkdir(path.join(craftPath, "ignore.d"), { recursive: true });
      console.log("Created craft directory structure:", craftPath);
      return { success: true };
   }
   catch (err) 
   {
      return {
         success: false,
         error  : err.message 
      };
   }
});
