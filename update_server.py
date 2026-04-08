"""
Simple update server for iTired Music Player
Run this alongside the main app.py or on a separate server
"""

from flask import Flask, jsonify, send_file
import os

app = Flask(__name__)

UPDATE_VERSION = "1.0.1"
UPDATE_FILE = "iTired_1.0.1_x64-setup.exe"
UPDATE_URL = "https://your-actual-download-url.com/iTired_1.0.1_x64-setup.exe"

@app.route('/updates/<platform>/<arch>/<version>')
def get_update(platform, arch, version):
    """Return update manifest for the requested version"""
    
    # Check if requested version is newer than current
    if version >= UPDATE_VERSION:
        return jsonify({
            "error": "Already up to date"
        }), 304
    
    return jsonify({
        "version": UPDATE_VERSION,
        "notes": "Bug fixes and performance improvements",
        "pub_date": "2026-04-07T00:00:00Z",
        "platforms": {
            "windows": {
                "signature": "",
                "url": UPDATE_URL,
                "installer_url": UPDATE_URL
            }
        }
    })

@app.route('/download/latest')
def download():
    """Direct download link for the latest version"""
    return jsonify({
        "version": UPDATE_VERSION,
        "url": UPDATE_URL
    })

@app.route('/version')
def current_version():
    """Get current latest version"""
    return jsonify({
        "version": UPDATE_VERSION,
        "release_date": "2026-04-07"
    })

if __name__ == '__main__':
    print(f"Update server running on http://localhost:5002")
    print(f"Current version: {UPDATE_VERSION}")
    print(f"Update URL: {UPDATE_URL}")
    app.run(host='0.0.0.0', port=5002, debug=True)
