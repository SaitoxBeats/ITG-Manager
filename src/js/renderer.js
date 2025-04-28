// Global variables
let _songsDirectory = '';
let _currentPack = null;
let _currentSong = null;
let _audioPlayer = null;
let _previewTimeout = null;

// UI Elements
const _elements = {
    songPacklist: document.getElementById('songPacklist'),
    songBanner: document.getElementById('song-banner'),
    songBannerBg: document.getElementById('bg'),
    songTitle: document.getElementById('song-title'),
    songArtist: document.getElementById('song-artist'),
    songCredit: document.getElementById('song-credit'),
    songBpm: document.getElementById('song-bpm'),
    diffList: document.getElementById('diff-list'),
    importBtn: document.getElementById('import-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    aboutBtn: document.getElementById('about-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    notification: document.getElementById('notification'),
    audioPlayerContainer: document.getElementById('audio-player'),
    playerControls: document.getElementById('player-controls')
};

// Initialization
window.addEventListener('DOMContentLoaded', async () => {
    // Configure error event for the banner image
    _elements.songBanner.addEventListener('error', (e) => {
        console.error('Error loading banner:', e);
        _elements.songBanner.src = '../img/banner.png';
    });
    
    await loadSettings();
    await loadPacks();
    setupEventListeners();
});

// Load settings
async function loadSettings() {
    try {
        const settings = await window.electron.getSettings();
        _songsDirectory = settings.songsDirectory;
    } catch (error) {
        showNotification('Error loading settings', 3000);
    }
}

// Load song packs
async function loadPacks() {
    try {
        showLoading('Loading song packs...');
        
        const packs = await window.electron.getPacks(_songsDirectory);
        _elements.songPacklist.innerHTML = '';
        
        if (packs.error) {
            _elements.songPacklist.innerHTML = `<li class="no-songs">Error: ${packs.error}</li>`;
            return;
        }
        
        if (packs.length === 0) {
            _elements.songPacklist.innerHTML = `<li class="no-songs">No packs found in ${_songsDirectory}</li>`;
            return;
        }
        
        // Create UI elements for each pack
    packs.forEach(pack => {
            const packPath = `${_songsDirectory}/${pack}`;
        const li = document.createElement('li');
        li.className = 'pack-item';
            li.innerHTML = `
                <div class="pack-header">
                    <button class="pack-btn">${pack}<span>▼</span></button>
                    <button class="import-pack-btn" title="Import to this pack">+</button>
                </div>
                <ul class="songs"></ul>
                <div class="drop-zone">Click the + button to import</div>
            `;
            li.setAttribute('data-path', packPath);
            _elements.songPacklist.appendChild(li);
            
            // Configure import button for the pack
            const importBtn = li.querySelector('.import-pack-btn');
            importBtn.addEventListener('click', async function(e) {
                e.stopPropagation(); // Prevent triggering the pack button
                await handleImport(packPath);
            });
        });
        
        // Add events to pack buttons
    document.querySelectorAll('.pack-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const packItem = this.closest('.pack-item');
                const songsList = packItem.querySelector('.songs');
                const packPath = packItem.getAttribute('data-path');
                
                // If the list is already loaded, just toggle visibility
                if (songsList.classList.contains('loaded')) {
                    songsList.classList.toggle('show');
                    return;
                }
                
                // Load songs from the pack
                try {
                    showLoading('Loading songs...');
                    const songs = await window.electron.getSongs(packPath);
                    
                    if (songs.error) {
                        showNotification(`Error loading songs: ${songs.error}`, 3000);
                        return;
                    }
                    
                    if (songs.length === 0) {
                        songsList.innerHTML = '<li class="song-item">No songs found</li>';
                    } else {
                        songsList.innerHTML = '';
                        songs.forEach(song => {
                            const songItem = document.createElement('li');
                            songItem.className = 'song-item';
                            songItem.innerHTML = `
                                <span class="song-title">${song.title}</span>
                                <button class="delete-btn" title="Delete song">×</button>
                            `;
                            songItem.setAttribute('data-path', song.path);
                            songItem.addEventListener('click', (e) => {
                                // Only trigger song info load if not clicking the delete button
                                if (!e.target.classList.contains('delete-btn')) {
                                    loadSongInfo(song.path, songItem);
                                }
                            });
                            
                            // Add delete button click handler
                            const deleteBtn = songItem.querySelector('.delete-btn');
                            deleteBtn.addEventListener('click', async (e) => {
                                e.stopPropagation(); // Prevent triggering the song item click
                                if (confirm(`Are you sure you want to move to trash "${song.title}"?`)) {
                                    try {
                                        showLoading('Moving to trash...');
                                        const result = await window.electron.deleteSong(song.path);
                                        if (result.success) {
                                            showNotification('Song moved to trash successfully', 3000);
                                            // Remove the song item from the list
                                            songItem.remove();
                                            // Clear song info if the deleted song was selected
                                            if (_currentSong === song.path) {
                                                clearSongInfo();
                                            }
                                        } else {
                                            showNotification(`Error deleting song: ${result.error}`, 3000);
                                        }
                                    } catch (error) {
                                        showNotification('Error deleting song', 3000);
                                    } finally {
                                        hideLoading();
                                    }
                                }
                            });
                            
                            songsList.appendChild(songItem);
                        });
                    }
                    
                    songsList.classList.add('loaded', 'show');
                } catch (error) {
                    showNotification('Error loading songs', 3000);
                } finally {
                    hideLoading();
                }
            });
        });
    } catch (error) {
        _elements.songPacklist.innerHTML = `<li class="no-songs">Error loading song packs</li>`;
        console.error('Error loading packs:', error);
    } finally {
        hideLoading();
    }
}

// Load detailed song information
async function loadSongInfo(songPath, songItem) {
    try {
        // Remove previous selection
        document.querySelectorAll('.song-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Add selection to current item
        songItem.classList.add('selected');
        
        // Stop any playing audio
        stopAudio();
        
        showLoading('Loading song information...');
        const songInfo = await window.electron.getSongInfo(songPath);
        
        if (songInfo.error) {
            showNotification(`Error: ${songInfo.error}`, 3000);
            return;
        }
        
        // Update UI with song information
        _elements.songTitle.textContent = songInfo.title || 'Unknown';
        _elements.songArtist.textContent = songInfo.artist || 'Unknown';
        _elements.songCredit.textContent = songInfo.credit || 'Unknown';
        _elements.songBpm.textContent = songInfo.bpms || '0';
        
        // Update banner and background
        updateBannerAndBackground(songInfo.bannerPath);
        
        // Update difficulty list
        _elements.diffList.innerHTML = '';
        if (songInfo.difficulties && songInfo.difficulties.length > 0) {
            songInfo.difficulties.forEach(diff => {
                const diffItem = document.createElement('div');
                diffItem.className = 'diff-item';
                diffItem.textContent = `${diff.name} (${diff.level})`;
                _elements.diffList.appendChild(diffItem);
            });
        } else {
            const diffItem = document.createElement('div');
            diffItem.className = 'diff-item';
            diffItem.textContent = 'No difficulties found';
            _elements.diffList.appendChild(diffItem);
        }
        
        // Configure audio player
        setupAudioPlayer(songInfo);
        
        // Update current song reference
        _currentSong = songPath;
    } catch (error) {
        showNotification('Error loading song information', 3000);
    } finally {
        hideLoading();
    }
}

// Function to update banner and background
function updateBannerAndBackground(bannerPath) {
    const defaultBanner = '../img/banner.png';
    
    try {
        // Update banner
        if (bannerPath) {
            // For img element, use direct path
            _elements.songBanner.src = bannerPath;
            
            // For CSS background, format correctly
            // Replace backslashes with forward slashes and add file:// protocol
            const formattedPath = 'file:///' + bannerPath.replace(/\\/g, '/');
            console.log('Setting background with:', formattedPath);
            _elements.songBannerBg.style.backgroundImage = `url("${formattedPath}")`;
        } else {
            _elements.songBanner.src = defaultBanner;
            _elements.songBannerBg.style.backgroundImage = `url("${defaultBanner}")`;
        }
    } catch (error) {
        console.error('Error updating banner:', error);
        _elements.songBanner.src = defaultBanner;
        _elements.songBannerBg.style.backgroundImage = `url("${defaultBanner}")`;
    }
}

// Configure audio player
function setupAudioPlayer(songInfo) {
    // Clear existing player
    _elements.audioPlayerContainer.innerHTML = '';
    _elements.playerControls.innerHTML = '';
    
    // If no music file, show message
    if (!songInfo.musicPath) {
        _elements.audioPlayerContainer.innerHTML = '<p>Audio file not found</p>';
        return;
    }
    
    // Create audio element
    _audioPlayer = document.createElement('audio');
    _audioPlayer.controls = true;
    _audioPlayer.src = songInfo.musicPath;
    _audioPlayer.id = 'audio-element';
    _elements.audioPlayerContainer.appendChild(_audioPlayer);
    
    // Create control buttons
    const playBtn = document.createElement('button');
    playBtn.className = 'player-btn';
    playBtn.textContent = 'Play full song';
    playBtn.addEventListener('click', () => {
        playFullAudio();
    });
    
    const previewBtn = document.createElement('button');
    previewBtn.className = 'player-btn';
    previewBtn.textContent = 'Play preview';
    previewBtn.addEventListener('click', () => {
        playPreview(songInfo.sampleStart, songInfo.sampleLength);
    });
    
    const stopBtn = document.createElement('button');
    stopBtn.className = 'player-btn';
    stopBtn.textContent = 'Stop';
    stopBtn.addEventListener('click', () => {
        stopAudio();
    });
    
    _elements.playerControls.appendChild(playBtn);
    _elements.playerControls.appendChild(previewBtn);
    _elements.playerControls.appendChild(stopBtn);
}

// Play full audio
function playFullAudio() {
    if (_audioPlayer) {
        // Clear existing timeout
        if (_previewTimeout) {
            clearTimeout(_previewTimeout);
            _previewTimeout = null;
        }
        
        _audioPlayer.currentTime = 0;
        _audioPlayer.play();
    }
}

// Play song preview
function playPreview(startTime, duration) {
    if (_audioPlayer) {
        // Clear existing timeout
        if (_previewTimeout) {
            clearTimeout(_previewTimeout);
            _previewTimeout = null;
        }
        
        // If no valid preview time, play from beginning for 10 seconds
        if (!startTime || startTime <= 0) startTime = 0;
        if (!duration || duration <= 0) duration = 10;
        
        // Set start point and play
        _audioPlayer.currentTime = startTime;
        _audioPlayer.play();
        
        // Set timeout to stop after preview duration
        _previewTimeout = setTimeout(() => {
            _audioPlayer.pause();
            _previewTimeout = null;
        }, duration * 1000);
    }
}

// Stop audio playback
function stopAudio() {
    if (_audioPlayer) {
        _audioPlayer.pause();
        _audioPlayer.currentTime = 0;
    }
    
    if (_previewTimeout) {
        clearTimeout(_previewTimeout);
        _previewTimeout = null;
    }
}

// Configure drop zone for importing
function setupDropZone(packItem, packPath) {
    const dropZone = packItem.querySelector('.drop-zone');
    
    // Drag over element events
    packItem.addEventListener('dragenter', function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.add('dragging');
    });
    
    packItem.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
    });
    
    packItem.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!this.contains(e.relatedTarget)) {
            this.classList.remove('dragging');
        }
    });
    
    // Drop event
    packItem.addEventListener('drop', async function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.remove('dragging');
        
        // Use the same import handler as buttons
        await handleImport(packPath);
    });
}

// Configure button and other element events
function setupEventListeners() {
    // Import button
    _elements.importBtn.addEventListener('click', async () => {
        try {
            // If no packs available, can't import
            if (_elements.songPacklist.children.length === 0 || 
                _elements.songPacklist.querySelector('.no-songs')) {
                showNotification('Error: No packs available for import', 3000);
                return;
            }
            
            // Get first pack as target
            const firstPack = _elements.songPacklist.querySelector('.pack-item');
            if (!firstPack) {
                showNotification('Error: No packs available for import', 3000);
                return;
            }
            
            const packPath = firstPack.getAttribute('data-path');
            await handleImport(packPath);
        } catch (error) {
            console.error('Error importing:', error);
            showNotification('Error importing content', 3000);
        }
    });
    
    // Settings button
    _elements.settingsBtn.addEventListener('click', () => {
        // Stop audio playback before navigating
        stopAudio();
        window.location.href = 'settings.html';
    });
    
    // About button
    _elements.aboutBtn.addEventListener('click', () => {
        // Stop audio playback before navigating
        stopAudio();
        window.location.href = 'about.html';
    });
    
    // Refresh button
    _elements.refreshBtn.addEventListener('click', async () => {
        // Stop audio playback before refreshing
        stopAudio();
        await loadPacks();
    });
    
    // Page close event
    window.addEventListener('beforeunload', () => {
        stopAudio();
    });
}

// Helper functions
function showLoading(text) {
    _elements.loadingText.textContent = text;
    _elements.loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    _elements.loadingOverlay.style.display = 'none';
}

function showNotification(message, duration = 2000) {
    _elements.notification.textContent = message;
    _elements.notification.style.display = 'block';
    
    setTimeout(() => {
        _elements.notification.style.display = 'none';
    }, duration);
}

// Import logic for pack button or drop area
async function handleImport(packPath) {
    try {
        // Show import type dialog
        const importTypeResult = await window.electron.showImportDialog();
        
        if (importTypeResult.canceled) {
            return;
        }
        
        let result;
        if (importTypeResult.importType === 'zip') {
            // Show ZIP file dialog
            result = await window.electron.showZipDialog();
        } else {
            // Show folder dialog
            result = await window.electron.showFolderDialog();
        }
        
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return;
        }
        
        showLoading('Importing content...');
        
        // Import each selected file/folder
        for (const filePath of result.filePaths) {
            const importResult = await window.electron.importContent(packPath, filePath);
            
            if (importResult.success) {
                showNotification(`${importResult.type === 'pack' ? 'Pack' : 'Song'} imported successfully!`, 3000);
            } else {
                showNotification(`Import error: ${importResult.error}`, 3000);
            }
        }
        
        // Reload packs after import
        await loadPacks();
    } catch (error) {
        console.error('Error importing:', error);
        showNotification('Error importing content', 3000);
    } finally {
        hideLoading();
    }
}