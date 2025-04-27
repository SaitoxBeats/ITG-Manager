const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const Store = require('electron-store');

// Store configuration for settings
const _store = new Store();

// Default configuration
if (!_store.get('songsDirectory')) {
    _store.set('songsDirectory', path.join(app.getPath('documents'), 'StepMania/Songs'));
}

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1024,
        height: 768,
        resizable: false,
        icon: path.join(__dirname, 'img/icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false // Allows loading local resources
        }
    });

    win.loadFile('src/view/index.html');

    win.webContents.setWindowOpenHandler(({ url }) =>{
        shell.openExternal(url);
        return { action: 'deny' }
    });
}

// Function to read SM file and extract information
function parseSMFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Extract basic information
        const title = content.match(/#TITLE:(.*?);/i)?.[1].trim() || 'Unknown';
        const artist = content.match(/#ARTIST:(.*?);/i)?.[1].trim() || 'Unknown';
        const credit = content.match(/#CREDIT:(.*?);/i)?.[1].trim() || 'Unknown';
        
        // Extract and format BPM
        const bpmsRaw = content.match(/#BPMS:(.*?);/i)?.[1].trim() || '0';
        let displayBpm = content.match(/#DISPLAYBPM:(.*?);/i)?.[1].trim();
        
        // If DISPLAYBPM is available, use it
        let bpms = displayBpm || '';
        
        // If no DISPLAYBPM, extract from BPMS
        if (!bpms) {
            // Try to extract the numeric BPM value
            const bpmMatch = bpmsRaw.match(/\d+\.?\d*=(\d+\.?\d*)/);
            if (bpmMatch && bpmMatch[1]) {
                bpms = Math.round(parseFloat(bpmMatch[1])).toString();
            } else {
                bpms = bpmsRaw; // Fallback to original value
            }
        }
        
        const banner = content.match(/#BANNER:(.*?);/i)?.[1].trim() || '';
        
        // Extract music file and preview information
        const musicFile = content.match(/#MUSIC:(.*?);/i)?.[1].trim() || '';
        const sampleStart = parseFloat(content.match(/#SAMPLESTART:(.*?);/i)?.[1].trim() || '0');
        const sampleLength = parseFloat(content.match(/#SAMPLELENGTH:(.*?);/i)?.[1].trim() || '0');
        
        // Extract difficulties
        const difficultyRegex = /#NOTES:[\s\S]*?dance-single:[\s\S]*?:[\s\S]*?(.*?):[\s\S]*?(\d+):/g;
        const difficulties = [];
        let match;
        
        while ((match = difficultyRegex.exec(content)) !== null) {
            difficulties.push({
                name: match[1].trim(),
                level: match[2].trim()
            });
        }
        
        return {
            title,
            artist,
            credit,
            bpms,
            banner,
            musicFile,
            sampleStart,
            sampleLength,
            difficulties
        };
    } catch (error) {
        console.error('Error processing SM file:', error);
        return {
            title: 'Error',
            artist: 'Error',
            credit: 'Error',
            bpms: '#0',
            banner: '',
            musicFile: '',
            sampleStart: 0,
            sampleLength: 0,
            difficulties: []
        };
    }
}

// Check if a directory contains song files (.sm or .ssc)
function isSongDirectory(dirPath) {
    try {
        const files = fs.readdirSync(dirPath);
        return files.some(file => {
            const ext = path.extname(file).toLowerCase();
            return ext === '.sm' || ext === '.ssc';
        });
    } catch (error) {
        console.error(`Error checking if ${dirPath} is a song directory:`, error);
        return false;
    }
}

// Copy files and directories recursively
function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    
    if (isDirectory) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursiveSync(
                path.join(src, childItemName),
                path.join(dest, childItemName)
            );
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

// Check if directory is a pack (contains song folders)
function isPackDirectory(dirPath) {
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        const dirs = items.filter(item => item.isDirectory());
        
        // If no subdirectories, it's not a pack
        if (dirs.length === 0) return false;
        
        // Check if at least one subdirectory is a song
        for (const dir of dirs) {
            const subDirPath = path.join(dirPath, dir.name);
            if (isSongDirectory(subDirPath)) {
                return true;
            }
        }
        
        return false;
    } catch (error) {
        return false;
    }
}

// Extract zip to a specific directory
function extractZipTo(zipPath, targetDir) {
    try {
        console.log(`Extracting ${zipPath} to ${targetDir}`);
        const _zip = new AdmZip(zipPath);
        
        // Check ZIP structure to determine if it's a song or a pack
        const _zipEntries = _zip.getEntries();
        const _rootFolders = new Set();
        const _smFiles = [];
        
        // Analyze ZIP structure
        _zipEntries.forEach(entry => {
            // Get root folders
            if (entry.entryName.includes('/')) {
                const _rootFolder = entry.entryName.split('/')[0];
                _rootFolders.add(_rootFolder);
            }
            
            // Find .sm files
            if (entry.entryName.toLowerCase().endsWith('.sm')) {
                _smFiles.push(entry.entryName);
            }
        });
        
        console.log(`ZIP contains ${_rootFolders.size} root folders and ${_smFiles.length} SM files`);
        
        // Determine if it's a song or a pack
        let _isSongZip = false;
        let _isPackZip = false;
        
        // Verificar se é um pack (múltiplos arquivos SM)
        if (_smFiles.length > 1) {
            // Se tem múltiplos arquivos SM, consideramos como um pack
            _isPackZip = true;
            console.log('ZIP contém múltiplos arquivos SM, tratando como pack');
        } 
        // Se tiver apenas um arquivo SM e uma pasta raiz, é uma música única
        else if (_smFiles.length === 1 && _rootFolders.size === 1) {
            _isSongZip = true;
            console.log('ZIP contém uma única música');
        }
        
        // Extract based on type
        if (_isSongZip) {
            // Para uma única música, extrair para o diretório do pack alvo
            console.log(`Extraindo música única para o pack: ${targetDir}`);
            
            // Extract all files
            _zip.extractAllTo(targetDir, true);
            
            return { success: true, type: 'song' };
        } else if (_isPackZip) {
            // Obter o diretório de músicas pai (Songs)
            const _songsDir = path.dirname(targetDir);
            
            // Criar um diretório temporário para extração
            const _tempDir = path.join(_songsDir, '_temp_extract_' + Date.now());
            fs.mkdirSync(_tempDir, { recursive: true });
            
            try {
                // Extrair para diretório temporário primeiro
                _zip.extractAllTo(_tempDir, true);
                
                // Se for um pack com uma única pasta raiz, mover essa pasta para o Songs
                if (_rootFolders.size === 1) {
                    const _rootFolder = Array.from(_rootFolders)[0];
                    const _srcPath = path.join(_tempDir, _rootFolder);
                    const _destPath = path.join(_songsDir, _rootFolder);
                    
                    // Verificar se a pasta raiz existe no diretório temporário
                    if (fs.existsSync(_srcPath) && fs.statSync(_srcPath).isDirectory()) {
                        // Se o destino já existir, não substitua, crie uma pasta com nome único
                        let _finalDestPath = _destPath;
                        let _counter = 1;
                        
                        while (fs.existsSync(_finalDestPath)) {
                            _finalDestPath = `${_destPath}_${_counter}`;
                            _counter++;
                        }
                        
                        // Copiar a pasta para o diretório Songs
                        copyRecursiveSync(_srcPath, _finalDestPath);
                    }
                } else {
                    // Para múltiplas pastas raiz ou estrutura desconhecida
                    // Verificar cada item no diretório temporário
                    fs.readdirSync(_tempDir, { withFileTypes: true })
                        .filter(item => item.isDirectory())
                        .forEach(item => {
                            const _srcPath = path.join(_tempDir, item.name);
                            
                            // Verificar se é um diretório de música válido
                            if (isSongDirectory(_srcPath)) {
                                const _destPath = path.join(_songsDir, item.name);
                                
                                // Se o destino já existir, não substitua, crie uma pasta com nome único
                                let _finalDestPath = _destPath;
                                let _counter = 1;
                                
                                while (fs.existsSync(_finalDestPath)) {
                                    _finalDestPath = `${_destPath}_${_counter}`;
                                    _counter++;
                                }
                                
                                // Copiar a pasta para o diretório Songs
                                copyRecursiveSync(_srcPath, _finalDestPath);
                            }
                        });
                }
                
                // Limpar diretório temporário
                fs.rmSync(_tempDir, { recursive: true, force: true });
                
                return { success: true, type: 'pack' };
            } catch (error) {
                // Limpar diretório temporário em caso de erro
                if (fs.existsSync(_tempDir)) {
                    fs.rmSync(_tempDir, { recursive: true, force: true });
                }
                throw error;
            }
        } else {
            // Estrutura desconhecida ou ZIP vazio, extrair para o destino
            console.log('Estrutura ZIP desconhecida, extraindo para o diretório alvo');
            _zip.extractAllTo(targetDir, true);
            return { success: true, type: 'unknown' };
        }
    } catch (error) {
        console.error('Erro ao extrair arquivo ZIP:', error);
        return { success: false, error: error.message };
    }
}

// Handler to get song packs
ipcMain.handle('get-packs', async (_, packsDir) => {
    try {
        const dirs = fs.readdirSync(packsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        return dirs;
    } catch (error) {
        console.error('Error reading packs directory:', error);
        return { error: 'Failed to read packs directory' };
    }
});

// Handler to get songs from a pack
ipcMain.handle('get-songs', async (_, packDir) => {
    try {
        const dirs = fs.readdirSync(packDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory() && isSongDirectory(path.join(packDir, dirent.name)))
            .map(dirent => {
                // Find the first .sm file to get the title
                const songDir = path.join(packDir, dirent.name);
                const files = fs.readdirSync(songDir);
                const smFile = files.find(file => file.toLowerCase().endsWith('.sm'));
                
                if (smFile) {
                    const smPath = path.join(songDir, smFile);
                    const { title } = parseSMFile(smPath);
                    return {
                        name: dirent.name,
                        title: title || dirent.name,
                        path: songDir
                    };
                }
                
                return {
                    name: dirent.name,
                    title: dirent.name,
                    path: songDir
                };
            });
        return dirs;
    } catch (error) {
        console.error('Error reading songs directory:', error);
        return { error: 'Failed to read songs directory' };
    }
});

// Handler to get detailed song information
ipcMain.handle('get-song-info', async (_, songPath) => {
    try {
        const files = fs.readdirSync(songPath);
        const smFile = files.find(file => file.toLowerCase().endsWith('.sm'));
        
        if (!smFile) {
            return { error: 'SM file not found' };
        }
        
        const smPath = path.join(songPath, smFile);
        const songInfo = parseSMFile(smPath);
        
        // Check if there's a banner and add the full path (absolute)
        if (songInfo.banner) {
            const relativeBannerPath = path.join(songPath, songInfo.banner);
            songInfo.bannerPath = path.resolve(relativeBannerPath);
            
            // Check if the file exists
            if (!fs.existsSync(songInfo.bannerPath)) {
                songInfo.bannerPath = null;
            }
        }
        
        // Check if there's a music file and add the full path (absolute)
        if (songInfo.musicFile) {
            const relativeMusicPath = path.join(songPath, songInfo.musicFile);
            songInfo.musicPath = path.resolve(relativeMusicPath);
            
            // Check if the file exists
            if (!fs.existsSync(songInfo.musicPath)) {
                songInfo.musicPath = null;
            }
        }
        
        return songInfo;
    } catch (error) {
        console.error('Error getting song information:', error);
        return { error: 'Failed to get song information' };
    }
});

// Handler to import content (zip or folder)
ipcMain.handle('import-content', async (_, targetDir, sourcePath) => {
    try {
        // Check if sourcePath was provided
        if (!sourcePath) {
            return { success: false, error: 'Source path not provided' };
        }
        
        // If it's a zip file
        if (sourcePath.toLowerCase().endsWith('.zip')) {
            // Extrai diretamente para o pack selecionado (targetDir)
            // em vez de extrair para o diretório pai (Songs)
            return extractZipTo(sourcePath, targetDir);
        }
        
        // If it's a directory
        if (fs.statSync(sourcePath).isDirectory()) {
            // Check if it's a pack or a song
            if (isSongDirectory(sourcePath)) {
                // It's a song, copy to the target directory
                const songName = path.basename(sourcePath);
                const destPath = path.join(targetDir, songName);
                
                // Copy the song folder with all subdirectories
                copyRecursiveSync(sourcePath, destPath);
                
                return { success: true, type: 'song' };
            } else if (isPackDirectory(sourcePath)) {
                // It's a pack, copy to the Songs directory
                const packName = path.basename(sourcePath);
                const songsDir = path.dirname(targetDir);
                const destPath = path.join(songsDir, packName);
                
                // Create the pack directory
                fs.mkdirSync(destPath, { recursive: true });
                
                // Copy the songs from the pack
                fs.readdirSync(sourcePath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .forEach(dirent => {
                        const srcSongDir = path.join(sourcePath, dirent.name);
                        const destSongDir = path.join(destPath, dirent.name);
                        
                        // Copy the song folder if it's a valid song
                        if (isSongDirectory(srcSongDir)) {
                            copyRecursiveSync(srcSongDir, destSongDir);
                        }
                    });
                
                return { success: true, type: 'pack' };
            }
        }
        
        return { success: false, error: 'Unrecognized format' };
    } catch (error) {
        console.error('Error importing content:', error);
        return { success: false, error: error.message };
    }
});

// Handler to get settings
ipcMain.handle('get-settings', async () => {
    return {
        songsDirectory: _store.get('songsDirectory')
    };
});

// Handler to save settings
ipcMain.handle('save-settings', async (_, settings) => {
    try {
        if (settings.songsDirectory) {
            _store.set('songsDirectory', settings.songsDirectory);
        }
        return { success: true };
    } catch (error) {
        console.error('Error saving settings:', error);
        return { success: false, error: error.message };
    }
});

// Handler to show import type dialog (ZIP or Folder)
ipcMain.handle('show-import-dialog', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showMessageBox(window, {
        type: 'question',
        title: 'Import Type',
        message: 'How would you like to import?',
        buttons: ['Import Folder', 'Import ZIP', 'Cancel'],
        defaultId: 0,
        cancelId: 2
    });
    
    // Return selected option (0 = Folder, 1 = ZIP, 2 = Cancel)
    return { 
        canceled: result.response === 2,
        importType: result.response === 1 ? 'zip' : 'folder'
    };
});

// Handler to open file selection dialog for ZIP files only
ipcMain.handle('show-zip-dialog', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
        properties: ['openFile'],
        filters: [
            { name: 'ZIP Files', extensions: ['zip'] }
        ]
    });
    
    if (result.canceled) {
        return { canceled: true };
    }
    
    return { canceled: false, filePaths: result.filePaths };
});

// Handler to open folder selection dialog
ipcMain.handle('show-folder-dialog', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory']
    });
    
    if (result.canceled) {
        return { canceled: true };
    }
    
    return { canceled: false, filePaths: result.filePaths };
});

// Handler to open folder selection dialog for settings
ipcMain.handle('show-directory-dialog', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory']
    });
    
    if (result.canceled) {
        return { canceled: true };
    }
    
    return { canceled: false, directoryPath: result.filePaths[0] };
});

app.on('browser-window-created', (_, window) => {
    window.setMenuBarVisibility(false);
});

app.whenReady().then(() => {
    createWindow();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
});
