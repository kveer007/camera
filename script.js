class PiCameraController {
    constructor() {
        this.piIp = null;
        this.authToken = null;
        this.statusInterval = null;
        this.videoFeedRetryCount = 0;
        this.maxRetries = 5;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Setup form
        document.getElementById('setupForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.connectToPi();
        });

        // Control buttons
        document.getElementById('startRecordingBtn').addEventListener('click', () => {
            this.startRecording();
        });

        document.getElementById('stopRecordingBtn').addEventListener('click', () => {
            this.stopRecording();
        });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Load saved settings
        this.loadSavedSettings();
    }

    loadSavedSettings() {
        const savedIp = localStorage.getItem('piCameraIp');
        if (savedIp) {
            document.getElementById('piIpAddress').value = savedIp;
        }
    }

    async connectToPi() {
        const piIp = document.getElementById('piIpAddress').value.trim();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();

        if (!piIp || !username || !password) {
            this.showError('Please fill in all fields');
            return;
        }

        // Validate IP format
        if (!this.isValidIP(piIp)) {
            this.showError('Please enter a valid IP address (e.g., 192.168.1.100)');
            return;
        }

        this.piIp = piIp;
        
        try {
            const response = await fetch(`http://${this.piIp}:5000/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                this.authToken = data.token;
                localStorage.setItem('piCameraIp', this.piIp);
                this.showDashboard();
                this.startStatusUpdates();
                this.startVideoFeed();
            } else {
                this.showError(data.message || 'Login failed');
            }
        } catch (error) {
            this.showError(`Cannot connect to Pi at ${this.piIp}:5000. Make sure the Pi is running and accessible.`);
            console.error('Connection error:', error);
        }
    }

    isValidIP(ip) {
        const pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!pattern.test(ip)) return false;
        
        return ip.split('.').every(part => {
            const num = parseInt(part);
            return num >= 0 && num <= 255;
        });
    }

    showError(message) {
        const errorDiv = document.getElementById('loginError');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }

    showDashboard() {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dashboardSection').style.display = 'block';
        document.getElementById('logoutBtn').style.display = 'block';
    }

    startVideoFeed() {
        const videoFeed = document.getElementById('videoFeed');
        const videoLoading = document.getElementById('videoLoading');
        
        videoFeed.src = `http://${this.piIp}:5000/api/video_feed?token=${this.authToken}`;
        
        videoFeed.onload = () => {
            videoLoading.style.display = 'none';
            videoFeed.style.display = 'block';
            this.videoFeedRetryCount = 0;
        };

        videoFeed.onerror = () => {
            if (this.videoFeedRetryCount < this.maxRetries) {
                this.videoFeedRetryCount++;
                setTimeout(() => {
                    videoFeed.src = `http://${this.piIp}:5000/api/video_feed?token=${this.authToken}&retry=${this.videoFeedRetryCount}`;
                }, 2000);
            } else {
                videoLoading.innerHTML = '<p class="text-danger">Failed to load video feed. Check camera connection.</p>';
            }
        };
    }

    async startStatusUpdates() {
        this.statusInterval = setInterval(() => {
            this.updateStatus();
        }, 5000);
        
        // Initial status update
        this.updateStatus();
    }

    async updateStatus() {
        try {
            const response = await fetch(`http://${this.piIp}:5000/api/status`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.updateStatusDisplay(data);
            } else {
                this.updateConnectionStatus('disconnected');
            }
        } catch (error) {
            this.updateConnectionStatus('disconnected');
            console.error('Status update error:', error);
        }
    }

    updateStatusDisplay(data) {
        // Connection status
        this.updateConnectionStatus('connected');

        // Recording status
        const recordingStatus = document.getElementById('recordingStatus');
        const startBtn = document.getElementById('startRecordingBtn');
        const stopBtn = document.getElementById('stopRecordingBtn');

        if (data.recording) {
            recordingStatus.innerHTML = '<span class="status-danger">Active</span>';
            startBtn.disabled = true;
            stopBtn.disabled = false;
        } else {
            recordingStatus.innerHTML = '<span class="status-good">Inactive</span>';
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }

        // Storage status
        document.getElementById('storageStatus').innerHTML = 
            `${data.storage.free_gb}GB free<br><small class="text-muted">of ${data.storage.total_gb}GB total</small>`;

        // Memory status
        const memoryClass = data.memory.used_percent > 80 ? 'status-danger' : 
                           data.memory.used_percent > 60 ? 'status-warning' : 'status-good';
        document.getElementById('memoryStatus').innerHTML = 
            `<span class="${memoryClass}">${data.memory.used_percent}% used</span><br><small class="text-muted">${data.memory.available_mb}MB free</small>`;

        // Camera status
        const cameraClass = data.camera_connected ? 'status-good' : 'status-danger';
        document.getElementById('cameraStatus').innerHTML = 
            `<span class="${cameraClass}">${data.camera_connected ? 'Connected' : 'Disconnected'}</span>`;

        // Recordings list
        this.updateRecordingsList(data.recordings);
    }

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connectionStatus');
        const indicator = '<span class="connection-indicator ' + status + '"></span>';
        
        switch(status) {
            case 'connected':
                statusElement.innerHTML = indicator + '<span class="status-good">Connected</span>';
                break;
            case 'disconnected':
                statusElement.innerHTML = indicator + '<span class="status-danger">Disconnected</span>';
                break;
            case 'connecting':
                statusElement.innerHTML = indicator + '<span class="status-warning">Connecting...</span>';
                break;
        }
    }

    updateRecordingsList(recordings) {
        const recordingsList = document.getElementById('recordingsList');
        
        if (recordings && recordings.length > 0) {
            recordingsList.innerHTML = recordings.map(recording => `
                <div class="recording-list-item">
                    <div class="fw-bold small">${recording.name}</div>
                    <small class="text-muted">${recording.created} • ${recording.size}</small>
                </div>
            `).join('');
        } else {
            recordingsList.innerHTML = '<p class="text-muted">No recordings found</p>';
        }
    }

    async startRecording() {
        try {
            const response = await fetch(`http://${this.piIp}:5000/api/start_recording`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            const data = await response.json();
            if (data.success) {
                this.updateStatus(); // Refresh status immediately
            }
        } catch (error) {
            console.error('Start recording error:', error);
        }
    }

    async stopRecording() {
        try {
            const response = await fetch(`http://${this.piIp}:5000/api/stop_recording`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            const data = await response.json();
            if (data.success) {
                this.updateStatus(); // Refresh status immediately
            }
        } catch (error) {
            console.error('Stop recording error:', error);
        }
    }

    async logout() {
        try {
            await fetch(`http://${this.piIp}:5000/api/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
        } catch (error) {
            console.error('Logout error:', error);
        }

        // Clear session data
        this.authToken = null;
        this.piIp = null;
        
        // Clear intervals
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }

        // Show login section
        document.getElementById('dashboardSection').style.display = 'none';
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('logoutBtn').style.display = 'none';

        // Clear form
        document.getElementById('password').value = '';
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new PiCameraController();
});
