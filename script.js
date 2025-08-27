/* =====================================================
   MODERN PI CAMERA SYSTEM - JAVASCRIPT CONTROLLER
   ===================================================== */

class CameraSystem {
    constructor() {
        // Configuration
        this.config = {
            // Updated to use your CloudFlare tunnel
            baseUrls: [
                'https://homesecurity182.duckdns.org',  // CloudFlare tunnel (primary)
                'https://192.168.0.147:5000'                    // Local fallback
            ],
            statusUpdateInterval: 5000,     // 5 seconds
            videoRetryDelay: 2000,         // 2 seconds
            maxRetries: 5,
            connectionTimeout: 10000       // 10 seconds
        };

        // State management
        this.state = {
            isLoggedIn: false,
            currentUrl: null,
            token: localStorage.getItem('camera_token'),
            username: localStorage.getItem('camera_username') || 'admin',
            isRecording: false,
            recordingStartTime: null,
            retryCount: 0,
            connectionStatus: 'connecting'
        };

        // Intervals and timers
        this.intervals = {
            status: null,
            recordingTimer: null,
            clockTimer: null
        };

        // Initialize system
        this.init();
    }

    /* =====================================
       INITIALIZATION
       ===================================== */

    async init() {
        console.log('🚀 Initializing Camera System...');
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Start clock
        this.startClock();
        
        // Check if user is already logged in
        if (this.state.token) {
            this.updateConnectionStatus('connecting', 'Reconnecting...');
            try {
                await this.findWorkingUrl();
                await this.verifyToken();
            } catch (error) {
                console.log('Previous session expired, showing login');
                this.logout();
            }
        } else {
            this.updateConnectionStatus('disconnected', 'Ready to connect');
        }
    }

    setupEventListeners() {
        // Form submissions
        document.getElementById('loginForm').addEventListener('submit', (e) => this.login(e));
        
        // Window events
        window.addEventListener('beforeunload', () => this.cleanup());
        window.addEventListener('focus', () => this.handleWindowFocus());
        window.addEventListener('blur', () => this.handleWindowBlur());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    /* =====================================
       CONNECTION MANAGEMENT
       ===================================== */

    async findWorkingUrl() {
        console.log('🔍 Finding working camera URL...');
        
        for (let url of this.config.baseUrls) {
            try {
                console.log(`⚡ Testing: ${url}`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.connectionTimeout);
                
                const response = await fetch(`${url}/api/status`, {
                    method: 'GET',
                    headers: this.state.token ? { 'Authorization': `Bearer ${this.state.token}` } : {},
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    this.state.currentUrl = url;
                    console.log(`✅ Connected to: ${url}`);
                    this.updateConnectionStatus('connected', `Connected via ${this.getUrlType(url)}`);
                    return url;
                }
            } catch (error) {
                console.log(`❌ Failed to connect to ${url}: ${error.message}`);
            }
        }
        
        this.updateConnectionStatus('disconnected', 'No camera server found');
        throw new Error('No camera server found');
    }

    getUrlType(url) {
        if (url.includes('duckdns.org')) return 'CloudFlare Tunnel';
        if (url.includes('192.168.')) return 'Local Network';
        return 'Remote Server';
    }

    updateConnectionStatus(status, message) {
        this.state.connectionStatus = status;
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.className = `connection-status status-${status}`;
            statusElement.innerHTML = `<span class="status-dot"></span><span class="status-text">${message}</span>`;
        }
    }

    /* =====================================
       AUTHENTICATION
       ===================================== */

    async login(event) {
        event.preventDefault();
        
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const loginBtn = document.getElementById('loginBtn');
        
        // Update UI
        this.setButtonLoading(loginBtn, true, 'Connecting...');
        this.updateConnectionStatus('connecting', 'Authenticating...');
        
        try {
            // Find working URL first
            await this.findWorkingUrl();
            
            // Attempt login
            const response = await fetch(`${this.state.currentUrl}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (data.success && data.token) {
                // Store credentials
                this.state.token = data.token;
                this.state.username = username;
                this.state.isLoggedIn = true;
                
                localStorage.setItem('camera_token', data.token);
                localStorage.setItem('camera_username', username);
                
                // Update UI
                this.showCameraInterface();
                this.updateConnectionStatus('connected', `Logged in as ${username}`);
                this.showNotification('success', 'Login successful!', `Connected via ${this.getUrlType(this.state.currentUrl)}`);
                
                // Start status updates
                this.startStatusUpdates();
                
                console.log('✅ Login successful');
            } else {
                throw new Error(data.message || 'Invalid credentials');
            }
            
        } catch (error) {
            console.error('❌ Login failed:', error);
            this.showNotification('danger', 'Login Failed', error.message);
            this.updateConnectionStatus('disconnected', 'Login failed');
        } finally {
            this.setButtonLoading(loginBtn, false, 'Connect to Camera');
        }
    }

    async verifyToken() {
        try {
            const response = await fetch(`${this.state.currentUrl}/api/status`, {
                headers: { 'Authorization': `Bearer ${this.state.token}` }
            });
            
            if (response.ok) {
                this.state.isLoggedIn = true;
                this.showCameraInterface();
                this.startStatusUpdates();
                return true;
            } else {
                throw new Error('Token verification failed');
            }
        } catch (error) {
            console.log('Token verification failed:', error);
            this.logout();
            return false;
        }
    }

    logout() {
        // Clear state
        this.state.isLoggedIn = false;
        this.state.token = null;
        this.state.currentUrl = null;
        
        // Clear storage
        localStorage.removeItem('camera_token');
        localStorage.removeItem('camera_username');
        
        // Stop intervals
        this.cleanup();
        
        // Update UI
        this.showLoginInterface();
        this.updateConnectionStatus('disconnected', 'Logged out');
        this.showNotification('info', 'Logged Out', 'Session ended successfully');
        
        console.log('👋 Logged out');
    }

    /* =====================================
       USER INTERFACE MANAGEMENT
       ===================================== */

    showLoginInterface() {
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('cameraSection').style.display = 'none';
        document.getElementById('userInfo').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'none';
    }

    showCameraInterface() {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('cameraSection').style.display = 'block';
        document.getElementById('userInfo').style.display = 'inline';
        document.getElementById('logoutBtn').style.display = 'inline-block';
        document.getElementById('username').textContent = this.state.username;
        
        // Initialize video feed
        this.initializeVideoFeed();
        
        // Load initial data
        this.refreshStatus();
        this.refreshRecordings();
    }

    /* =====================================
       VIDEO FEED MANAGEMENT
       ===================================== */

    initializeVideoFeed() {
        const videoFeed = document.getElementById('videoFeed');
        const videoLoading = document.getElementById('videoLoading');
        
        if (!videoFeed || !this.state.currentUrl || !this.state.token) {
            console.error('Cannot initialize video feed: missing elements or authentication');
            return;
        }
        
        const feedUrl = `${this.state.currentUrl}/api/video_feed?token=${this.state.token}&t=${Date.now()}`;
        
        console.log('📹 Initializing video feed:', feedUrl);
        
        // Show loading
        videoLoading.style.display = 'block';
        
        // Set up video feed
        videoFeed.onload = () => {
            console.log('✅ Video feed loaded');
            videoLoading.style.display = 'none';
            this.state.retryCount = 0;
        };
        
        videoFeed.onerror = () => {
            console.error('❌ Video feed error');
            this.handleVideoError();
        };
        
        videoFeed.src = feedUrl;
    }

    handleVideoError() {
        const videoLoading = document.getElementById('videoLoading');
        
        if (this.state.retryCount < this.config.maxRetries) {
            this.state.retryCount++;
            console.log(`🔄 Retrying video feed (${this.state.retryCount}/${this.config.maxRetries})`);
            
            videoLoading.innerHTML = `
                <div class="spinner-border text-light" role="status"></div>
                <div class="mt-2">Reconnecting... (${this.state.retryCount}/${this.config.maxRetries})</div>
            `;
            
            setTimeout(() => this.initializeVideoFeed(), this.config.videoRetryDelay * this.state.retryCount);
        } else {
            videoLoading.innerHTML = `
                <i class="bi bi-exclamation-triangle text-warning" style="font-size: 3rem;"></i>
                <div class="mt-2">Video feed unavailable</div>
                <button class="btn btn-sm btn-outline-light mt-2" onclick="cameraSystem.refreshFeed()">
                    <i class="bi bi-arrow-clockwise me-1"></i>Retry
                </button>
            `;
        }
    }

    refreshFeed() {
        this.state.retryCount = 0;
        this.initializeVideoFeed();
    }

    toggleFullscreen() {
        const videoContainer = document.querySelector('.video-container');
        
        if (!document.fullscreenElement) {
            videoContainer.requestFullscreen().catch(err => {
                console.error('Error entering fullscreen:', err);
                this.showNotification('warning', 'Fullscreen Error', 'Unable to enter fullscreen mode');
            });
        } else {
            document.exitFullscreen();
        }
    }

    /* =====================================
       RECORDING MANAGEMENT
       ===================================== */

    async startRecording() {
        try {
            const response = await this.makeApiCall('/api/start_recording', 'POST');
            
            if (response.success) {
                this.state.isRecording = true;
                this.state.recordingStartTime = Date.now();
                this.updateRecordingUI(true);
                this.startRecordingTimer();
                this.showNotification('success', 'Recording Started', 'Video recording is now active');
                console.log('🔴 Recording started');
            } else {
                throw new Error(response.message || 'Failed to start recording');
            }
        } catch (error) {
            console.error('❌ Failed to start recording:', error);
            this.showNotification('danger', 'Recording Error', error.message);
        }
    }

    async stopRecording() {
        try {
            const response = await this.makeApiCall('/api/stop_recording', 'POST');
            
            if (response.success) {
                this.state.isRecording = false;
                this.state.recordingStartTime = null;
                this.updateRecordingUI(false);
                this.stopRecordingTimer();
                this.showNotification('info', 'Recording Stopped', 'Video has been saved');
                
                // Refresh recordings list
                setTimeout(() => this.refreshRecordings(), 1000);
                
                console.log('⏹️ Recording stopped');
            } else {
                throw new Error(response.message || 'Failed to stop recording');
            }
        } catch (error) {
            console.error('❌ Failed to stop recording:', error);
            this.showNotification('danger', 'Recording Error', error.message);
        }
    }

    updateRecordingUI(isRecording) {
        const startBtn = document.getElementById('startRecordingBtn');
        const stopBtn = document.getElementById('stopRecordingBtn');
        const timer = document.getElementById('recordingTimer');
        const statusBadge = document.getElementById('recordingStatusBadge');
        
        if (isRecording) {
            startBtn.style.display = 'none';
            stopBtn.style.display = 'block';
            timer.style.display = 'block';
            statusBadge.innerHTML = '<i class="bi bi-record-fill"></i> Recording';
            statusBadge.className = 'badge bg-danger';
        } else {
            startBtn.style.display = 'block';
            stopBtn.style.display = 'none';
            timer.style.display = 'none';
            statusBadge.innerHTML = '<i class="bi bi-stop-circle"></i> Standby';
            statusBadge.className = 'badge bg-info';
        }
    }

    startRecordingTimer() {
        this.intervals.recordingTimer = setInterval(() => {
            if (this.state.recordingStartTime) {
                const elapsed = Date.now() - this.state.recordingStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                document.getElementById('recordingTime').textContent = 
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    stopRecordingTimer() {
        if (this.intervals.recordingTimer) {
            clearInterval(this.intervals.recordingTimer);
            this.intervals.recordingTimer = null;
        }
    }

    /* =====================================
       STATUS AND DATA MANAGEMENT
       ===================================== */

    async refreshStatus() {
        try {
            const status = await this.makeApiCall('/api/status');
            this.updateSystemStatus(status);
        } catch (error) {
            console.error('❌ Failed to refresh status:', error);
        }
    }

    updateSystemStatus(status) {
        // Update recording state
        if (status.recording !== this.state.isRecording) {
            this.state.isRecording = status.recording;
            this.updateRecordingUI(status.recording);
            
            if (status.recording && !this.state.recordingStartTime) {
                this.state.recordingStartTime = Date.now();
                this.startRecordingTimer();
            } else if (!status.recording && this.state.recordingStartTime) {
                this.state.recordingStartTime = null;
                this.stopRecordingTimer();
            }
        }
        
        // Update system information
        if (status.storage) {
            document.getElementById('storageInfo').innerHTML = 
                `${status.storage.free_gb?.toFixed(1) || 'N/A'} GB free`;
        }
        
        if (status.memory) {
            document.getElementById('memoryInfo').innerHTML = 
                `${status.memory.used_percent?.toFixed(1) || 'N/A'}% used`;
        }
        
        // Update camera status
        const cameraStatusBadge = document.getElementById('cameraStatusBadge');
        if (status.camera_connected) {
            cameraStatusBadge.innerHTML = '<i class="bi bi-camera-video"></i> Camera Ready';
            cameraStatusBadge.className = 'badge bg-success';
        } else {
            cameraStatusBadge.innerHTML = '<i class="bi bi-camera-video-off"></i> Camera Error';
            cameraStatusBadge.className = 'badge bg-danger';
        }
        
        // Update overlay
        this.updateVideoOverlay(status);
    }

    updateVideoOverlay(status) {
        const overlayTime = document.getElementById('overlayTime');
        const overlayStatus = document.getElementById('overlayStatus');
        
        if (overlayTime) {
            overlayTime.textContent = new Date().toLocaleTimeString();
        }
        
        if (overlayStatus && status) {
            const statusText = [];
            if (status.recording) statusText.push('🔴 REC');
            if (status.storage?.free_gb < 1) statusText.push('⚠️ LOW STORAGE');
            if (status.memory?.used_percent > 90) statusText.push('⚠️ HIGH MEMORY');
            
            overlayStatus.textContent = statusText.join(' | ') || '📹 LIVE';
        }
    }

    startStatusUpdates() {
        this.refreshStatus(); // Initial load
        this.intervals.status = setInterval(() => {
            if (this.state.isLoggedIn) {
                this.refreshStatus();
            }
        }, this.config.statusUpdateInterval);
    }

    /* =====================================
       RECORDINGS MANAGEMENT
       ===================================== */

    async refreshRecordings() {
        try {
            const status = await this.makeApiCall('/api/status');
            this.updateRecordingsList(status.recordings || []);
        } catch (error) {
            console.error('❌ Failed to refresh recordings:', error);
            document.getElementById('recordingsList').innerHTML = `
                <div class="text-center text-danger">
                    <i class="bi bi-exclamation-circle"></i><br>
                    Failed to load recordings
                </div>
            `;
        }
    }

    updateRecordingsList(recordings) {
        const recordingsList = document.getElementById('recordingsList');
        
        if (!recordings || recordings.length === 0) {
            recordingsList.innerHTML = `
                <div class="text-center text-muted">
                    <i class="bi bi-collection"></i><br>
                    No recordings found
                </div>
            `;
            return;
        }
        
        const sortedRecordings = recordings
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10); // Show last 10 recordings
        
        recordingsList.innerHTML = sortedRecordings.map(recording => `
            <div class="recording-item">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="recording-info">
                        <div class="fw-bold">${this.formatRecordingName(recording.filename)}</div>
                        <div class="recording-size">${this.formatFileSize(recording.size)} • ${this.formatDate(recording.date)}</div>
                    </div>
                    <button class="btn btn-sm btn-outline-primary" onclick="cameraSystem.downloadRecording('${recording.filename}')" title="Download">
                        <i class="bi bi-download"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    formatRecordingName(filename) {
        // Convert "recording_20240825_143022.avi" to "Aug 25, 2:30 PM"
        const match = filename.match(/recording_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
        if (match) {
            const [, year, month, day, hour, minute] = match;
            const date = new Date(year, month - 1, day, hour, minute);
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
            });
        }
        return filename.replace(/\.[^/.]+$/, ""); // Remove extension
    }

    formatFileSize(bytes) {
        if (!bytes) return 'Unknown size';
        const MB = bytes / (1024 * 1024);
        return `${MB.toFixed(1)} MB`;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
        });
    }

    downloadRecording(filename) {
        if (this.state.currentUrl && this.state.token) {
            const url = `${this.state.currentUrl}/api/download/${filename}?token=${this.state.token}`;
            window.open(url, '_blank');
            this.showNotification('info', 'Download Started', `Downloading ${filename}`);
        }
    }

    /* =====================================
       UTILITY FUNCTIONS
       ===================================== */

    async makeApiCall(endpoint, method = 'GET', body = null) {
        if (!this.state.currentUrl || !this.state.token) {
            throw new Error('Not connected or authenticated');
        }
        
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${this.state.token}`,
                'Content-Type': 'application/json'
            }
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        try {
            const response = await fetch(`${this.state.currentUrl}${endpoint}`, options);
            
            if (response.status === 401) {
                // Token expired
                this.logout();
                throw new Error('Session expired. Please login again.');
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                // Network error - try to reconnect
                this.updateConnectionStatus('connecting', 'Reconnecting...');
                await this.findWorkingUrl();
                throw new Error('Connection lost. Please try again.');
            }
            throw error;
        }
    }

    showNotification(type, title, message) {
        const toast = document.getElementById('notificationToast');
        const toastBody = document.getElementById('toastMessage');
        
        // Update toast content
        const iconMap = {
            success: 'bi-check-circle text-success',
            danger: 'bi-exclamation-triangle text-danger',
            warning: 'bi-exclamation-triangle text-warning',
            info: 'bi-info-circle text-primary'
        };
        
        const icon = iconMap[type] || iconMap.info;
        
        document.querySelector('.toast-header i').className = `bi ${icon} me-2`;
        toastBody.innerHTML = `<strong>${title}</strong><br>${message}`;
        
        // Show toast
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
    }

    setButtonLoading(button, isLoading, loadingText = 'Loading...') {
        const btnText = button.querySelector('.btn-text') || button;
        
        if (isLoading) {
            button.disabled = true;
            button.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${loadingText}`;
        } else {
            button.disabled = false;
            button.innerHTML = btnText.textContent || loadingText;
        }
    }

    startClock() {
        this.intervals.clockTimer = setInterval(() => {
            const overlayTime = document.getElementById('overlayTime');
            if (overlayTime) {
                overlayTime.textContent = new Date().toLocaleTimeString();
            }
        }, 1000);
    }

    cleanup() {
        Object.values(this.intervals).forEach(interval => {
            if (interval) clearInterval(interval);
        });
    }

    /* =====================================
       EVENT HANDLERS
       ===================================== */

    handleWindowFocus() {
        if (this.state.isLoggedIn) {
            this.refreshStatus();
            if (!this.intervals.status) {
                this.startStatusUpdates();
            }
        }
    }

    handleWindowBlur() {
        // Reduce update frequency when window is not focused
        // This helps with battery life on mobile devices
    }

    handleKeyboardShortcuts(event) {
        if (event.ctrlKey || event.metaKey) {
            switch (event.key) {
                case 'r':
                    event.preventDefault();
                    if (this.state.isLoggedIn) {
                        if (this.state.isRecording) {
                            this.stopRecording();
                        } else {
                            this.startRecording();
                        }
                    }
                    break;
                case 'f':
                    event.preventDefault();
                    this.refreshFeed();
                    break;
                case 's':
                    event.preventDefault();
                    this.refreshStatus();
                    break;
            }
        }
        
        if (event.key === 'Escape') {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }
        }
    }

    /* =====================================
       ADDITIONAL FEATURES
       ===================================== */

    async captureSnapshot() {
        try {
            const response = await this.makeApiCall('/api/snapshot', 'POST');
            if (response.success) {
                this.showNotification('success', 'Snapshot Captured', 'Image saved successfully');
            }
        } catch (error) {
            this.showNotification('danger', 'Snapshot Error', error.message);
        }
    }

    async showSystemInfo() {
        try {
            const status = await this.makeApiCall('/api/status');
            const systemInfo = this.formatSystemInfo(status);
            
            document.getElementById('systemInfoContent').innerHTML = systemInfo;
            const modal = new bootstrap.Modal(document.getElementById('systemInfoModal'));
            modal.show();
        } catch (error) {
            this.showNotification('danger', 'System Info Error', error.message);
        }
    }

    formatSystemInfo(status) {
        return `
            <div class="row">
                <div class="col-md-6">
                    <h6><i class="bi bi-camera-video me-2"></i>Camera Status</h6>
                    <ul class="list-unstyled">
                        <li><strong>Connected:</strong> ${status.camera_connected ? 'Yes' : 'No'}</li>
                        <li><strong>Recording:</strong> ${status.recording ? 'Active' : 'Inactive'}</li>
                        <li><strong>Resolution:</strong> 640x480</li>
                        <li><strong>Frame Rate:</strong> 15 FPS</li>
                    </ul>
                </div>
                <div class="col-md-6">
                    <h6><i class="bi bi-hdd me-2"></i>Storage</h6>
                    <ul class="list-unstyled">
                        <li><strong>Free Space:</strong> ${status.storage?.free_gb?.toFixed(1) || 'N/A'} GB</li>
                        <li><strong>Used Space:</strong> ${status.storage?.used_gb?.toFixed(1) || 'N/A'} GB</li>
                        <li><strong>Total Space:</strong> ${status.storage?.total_gb?.toFixed(1) || 'N/A'} GB</li>
                        <li><strong>Recordings:</strong> ${status.recordings?.length || 0}</li>
                    </ul>
                </div>
                <div class="col-md-6">
                    <h6><i class="bi bi-memory me-2"></i>Memory</h6>
                    <ul class="list-unstyled">
                        <li><strong>Used:</strong> ${status.memory?.used_percent?.toFixed(1) || 'N/A'}%</li>
                        <li><strong>Available:</strong> ${status.memory?.available_mb?.toFixed(0) || 'N/A'} MB</li>
                    </ul>
                </div>
                <div class="col-md-6">
                    <h6><i class="bi bi-globe me-2"></i>Connection</h6>
                    <ul class="list-unstyled">
                        <li><strong>URL:</strong> ${this.state.currentUrl}</li>
                        <li><strong>Type:</strong> ${this.getUrlType(this.state.currentUrl)}</li>
                        <li><strong>Status:</strong> ${this.state.connectionStatus}</li>
                    </ul>
                </div>
            </div>
        `;
    }

    togglePassword() {
        const passwordInput = document.getElementById('loginPassword');
        const passwordToggle = document.getElementById('passwordToggle');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            passwordToggle.className = 'bi bi-eye-slash';
        } else {
            passwordInput.type = 'password';
            passwordToggle.className = 'bi bi-eye';
        }
    }
}

/* =====================================
   GLOBAL FUNCTIONS & INITIALIZATION
   ===================================== */

// Global camera system instance
let cameraSystem;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    cameraSystem = new CameraSystem();
});

// Global functions for HTML onclick handlers
function login(event) {
    cameraSystem.login(event);
}

function logout() {
    cameraSystem.logout();
}

function startRecording() {
    cameraSystem.startRecording();
}

function stopRecording() {
    cameraSystem.stopRecording();
}

function refreshFeed() {
    cameraSystem.refreshFeed();
}

function refreshStatus() {
    cameraSystem.refreshStatus();
}

function refreshRecordings() {
    cameraSystem.refreshRecordings();
}

function toggleFullscreen() {
    cameraSystem.toggleFullscreen();
}

function captureSnapshot() {
    cameraSystem.captureSnapshot();
}

function showSystemInfo() {
    cameraSystem.showSystemInfo();
}

function togglePassword() {
    cameraSystem.togglePassword();
}

/* =====================================
   SERVICE WORKER REGISTRATION
   ===================================== */

/*// Register service worker for offline functionality (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/camera/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

/* =====================================
   PWA INSTALLATION PROMPT
   ===================================== */

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    
    // Show install button/banner if desired
    console.log('PWA installation available');
});

window.addEventListener('appinstalled', (evt) => {
    console.log('PWA was installed');
    cameraSystem.showNotification('success', 'App Installed', 'Camera system is now available offline!');
});

/* =====================================
   PERFORMANCE MONITORING
   ===================================== */

// Monitor page load performance
window.addEventListener('load', () => {
    if ('performance' in window) {
        const perfData = performance.getEntriesByType('navigation')[0];
        console.log(`Page load time: ${perfData.loadEventEnd - perfData.loadEventStart}ms`);
    }
});

// Monitor memory usage (if available)
if ('memory' in performance) {
    setInterval(() => {
        const memInfo = performance.memory;
        if (memInfo.usedJSHeapSize > memInfo.jsHeapSizeLimit * 0.9) {
            console.warn('High memory usage detected');
        }
    }, 30000); // Check every 30 seconds
}

/* =====================================
   ERROR HANDLING
   ===================================== */

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    if (cameraSystem) {
        cameraSystem.showNotification('danger', 'Application Error', 'An unexpected error occurred');
    }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    if (cameraSystem) {
        cameraSystem.showNotification('warning', 'Connection Issue', 'Please check your network connection');
    }
});

/* =====================================
   UTILITY FUNCTIONS
   ===================================== */

// Debounce function for performance optimization
function debounce(func, wait, immediate) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func.apply(this, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(this, args);
    };
}

// Throttle function for performance optimization
function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Format bytes to human readable string
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Copy text to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        if (cameraSystem) {
            cameraSystem.showNotification('success', 'Copied', 'Text copied to clipboard');
        }
    } catch (err) {
        console.error('Failed to copy text: ', err);
        if (cameraSystem) {
            cameraSystem.showNotification('warning', 'Copy Failed', 'Unable to copy to clipboard');
        }
    }
}

// Check if device is mobile
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Get device type
function getDeviceType() {
    if (isMobileDevice()) {
        return /iPad/.test(navigator.userAgent) ? 'tablet' : 'mobile';
    }
    return 'desktop';
}

// Check network connection
function checkNetworkConnection() {
    return navigator.onLine;
}

// Network status change handler
window.addEventListener('online', () => {
    console.log('Network connection restored');
    if (cameraSystem) {
        cameraSystem.updateConnectionStatus('connecting', 'Reconnecting...');
        cameraSystem.findWorkingUrl().catch(() => {
            cameraSystem.updateConnectionStatus('disconnected', 'Connection failed');
        });
    }
});

window.addEventListener('offline', () => {
    console.log('Network connection lost');
    if (cameraSystem) {
        cameraSystem.updateConnectionStatus('disconnected', 'No internet connection');
    }
});

/* =====================================
   BROWSER COMPATIBILITY
   ===================================== */

// Check for required browser features
function checkBrowserCompatibility() {
    const requiredFeatures = [
        'fetch',
        'Promise',
        'localStorage',
        'sessionStorage'
    ];
    
    const missingFeatures = requiredFeatures.filter(feature => !(feature in window));
    
    if (missingFeatures.length > 0) {
        console.error('Missing browser features:', missingFeatures);
        alert(`Your browser is missing required features: ${missingFeatures.join(', ')}. Please update your browser.`);
        return false;
    }
    
    return true;
}

// Initialize compatibility check
document.addEventListener('DOMContentLoaded', () => {
    if (!checkBrowserCompatibility()) {
        document.body.innerHTML = `
            <div class="container mt-5">
                <div class="alert alert-danger">
                    <h4>Browser Not Supported</h4>
                    <p>Your browser doesn't support all required features. Please update to a modern browser.</p>
                    <p><strong>Recommended browsers:</strong></p>
                    <ul>
                        <li>Chrome 80+</li>
                        <li>Firefox 75+</li>
                        <li>Safari 13+</li>
                        <li>Edge 80+</li>
                    </ul>
                </div>
            </div>
        `;
    }
});

/* =====================================
   DEVELOPMENT HELPERS
   ===================================== */

// Development mode detection
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname.includes('github.io');

// Debug logging (only in development)
function debugLog(...args) {
    if (isDevelopment) {
        console.log('[DEBUG]', ...args);
    }
}

// Performance timing helper
function timeFunction(name, fn) {
    return async function(...args) {
        const start = performance.now();
        const result = await fn.apply(this, args);
        const end = performance.now();
        debugLog(`${name} took ${(end - start).toFixed(2)}ms`);
        return result;
    };
}

// Export for testing (development only)
if (isDevelopment) {
    window.CameraSystemDebug = {
        cameraSystem: () => cameraSystem,
        debugLog,
        timeFunction,
        formatBytes,
        getDeviceType,
        checkNetworkConnection
    };
}

console.log('🎉 Camera System JavaScript loaded successfully!');
console.log(`📱 Device type: ${getDeviceType()}`);
console.log(`🌐 Online status: ${checkNetworkConnection()}`);
console.log(`🔧 Development mode: ${isDevelopment}`);

/* =====================================
   END OF SCRIPT
   ===================================== */
