# 🎧 iTired Music

Music streaming platform with Yandex Music and VK integration.

## Quick Start

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Start server
```bash
python app.py
```

### 3. Give access to friends

Download ngrok: https://ngrok.com/download

In new terminal:
```bash
ngrok http 5001
```

Copy the URL and send to friends.

### 4. Friends connect

Download `dist/iTired.exe`, run, enter URL.

## For Hosting (no VPS)

Use `dist/start.bat` for automatic ngrok + server launch.

## Project Structure

```
itiredmp3-main/
├── app.py           # Flask application
├── models.py        # Database models
├── utils.py         # API clients
├── config.py        # Configuration
├── requirements.txt  # Python dependencies
├── dist/            # Ready-to-share client
│   ├── iTired.exe   # Desktop app
│   ├── setup.html   # Connection page
│   └── start.bat    # Auto-launch with ngrok
└── templates/       # HTML templates
```

## Requirements

- Python 3.10+
- Windows 10+
