const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    getPacks: (dir) => ipcRenderer.invoke('get-packs', dir),
    getSongs: (packDir) => ipcRenderer.invoke('get-songs', packDir),
    getSongInfo: (songPath) => ipcRenderer.invoke('get-song-info', songPath),
    importContent: (targetDir, filePath) => ipcRenderer.invoke('import-content', targetDir, filePath),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    showImportDialog: () => ipcRenderer.invoke('show-import-dialog'),
    showZipDialog: () => ipcRenderer.invoke('show-zip-dialog'),
    showFolderDialog: () => ipcRenderer.invoke('show-folder-dialog'),
    showDirectoryDialog: () => ipcRenderer.invoke('show-directory-dialog')
});