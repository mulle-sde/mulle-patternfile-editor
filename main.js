const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const { exec } = require("child_process");
const os = require("os");

let mainWindow;

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
               label      : "Preferences…",
               accelerator: "CmdOrCtrl+,",
               click      : () => mainWindow.webContents.send("menu-preferences"),
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

app.whenReady().then(createWindow);

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

ipcMain.handle("run-mulle-match", async (event, projectPath, tempDir, envVars = {}) => 
{
   return new Promise((resolve) => 
   {
      const cacheDir = path.join(tempDir, "cache");
      
      // Build -D flags for environment variables
      // Use single quotes to prevent premature shell expansion
      let envFlags = "";
      for (const [key, value] of Object.entries(envVars)) 
      {
         if (value) 
         {
            const escapedValue = value.replace(/'/g, "'\\''");
            envFlags += ` -D${key}='${escapedValue}'`;
         }
      }
      
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
      
      exec(command, (error, stdout, stderr) => 
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
      
      exec(command, (error, stdout, stderr) => 
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
