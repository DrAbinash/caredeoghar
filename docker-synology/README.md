# Care Diagnostics on Synology NAS (Docker)

Run Care Diagnostics on your Synology NAS using Docker / Container Manager. Perfect for clinics that want a 24/7 server without leaving a PC running.

## What You Need

- Synology NAS with DSM 7.x (or DSM 6.x with Docker package)
- At least 4 GB RAM recommended (2 GB minimum)
- Admin access to install packages and run SSH commands

## Step-by-Step Installation

### 1. Install Container Manager

1. Open **Package Center** on your Synology
2. Search for **Container Manager**
3. Click **Install**
4. Wait for installation to complete

### 2. Enable SSH (required for first setup)

1. Open **Control Panel** → **Terminal & SNMP**
2. Check **Enable SSH service**
3. Set port to **22** (or your preferred port)
4. Click **Apply**

### 3. Upload Project Files

**Option A: Via Shared Folder (easiest)**
1. Open **File Station** on your Synology
2. Create a new shared folder called `diagno-center` (or any name)
3. Copy the entire project folder into it using the web interface or SMB/FTP

**Option B: Via SSH (for tech users)**
```bash
# SSH into your Synology
ssh admin@your-nas-ip
# Navigate to a shared folder
cd /volume1/diagno-center
# Copy files via scp or git clone
```

### 4. Configure Environment

1. In File Station, navigate to `diagno-center/docker-synology/`
2. Find the file named `.env.example`
3. Right-click → **Rename** → change to `.env`
4. Double-click to edit (or download, edit, upload back)
5. Change at minimum:
   - `DB_PASSWORD=changeme` → set a strong password
   - `HOST_PORT=8888` → change if this port is already in use

### 5. Build and Start

Open **Container Manager** → **Project** → **Create**:

1. Project name: `diagno-center`
2. Path: browse to `docker-synology/docker-compose.yml`
3. Click **Next** → **Build**

Or via SSH:
```bash
cd /volume1/diagno-center/docker-synology
docker compose up -d --build
```

Wait about 5-10 minutes for the first build (downloads Node, builds the app).

### 6. Create Database Tables

Run the migration once to create all tables:

**Via SSH:**
```bash
cd /volume1/diagno-center/docker-synology
docker compose run --rm migrate
```

**Or via Container Manager:**
1. Go to **Container** → find `diagno-migrate`
2. Click **Action** → **Run** (it will exit after finishing)

### 7. Open the App

In your browser:
```
http://your-nas-ip:8888
```

Replace `your-nas-ip` with your Synology's IP address (check in Control Panel → Network).

The login screen appears. Default admin PIN is set during first-run setup in the app.

## Daily Use

| Task | How |
|------|-----|
| **Check if running** | Container Manager → Container → look for `diagno-web` and `diagno-api` with green status |
| **Restart** | Container Manager → select all 3 containers → Action → Restart |
| **View logs** | Container Manager → select container → Logs tab |
| **Backup database** | Copy the `postgres_data` folder to another location via File Station |
| **Update app** | See "Updating" section below |

## Updating the App

When a new version is released:

1. Copy the new project files over the old ones (keeping your `.env` file)
2. Via SSH:
   ```bash
   cd /volume1/diagno-center/docker-synology
   docker compose down
   docker compose up -d --build
   docker compose run --rm migrate
   ```
3. Or in Container Manager: stop the project, rebuild, restart

Your data in `postgres_data/` is preserved.

## Backing Up

**Database (most important):**
- Copy the entire `postgres_data` folder regularly to a USB drive or another shared folder

**Full system backup:**
- Container Manager → select the `diagno-center` project → **Export** (creates a `.dcp` file)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Cannot GET /" in browser | Wait 2 more minutes — the API may still be starting |
| Port 8888 already in use | Change `HOST_PORT` in `.env` to another number (e.g., 8889) |
| Container won't start | Check RAM usage (Control Panel → Resource Monitor). Need at least 2 GB free. |
| Database connection error | Make sure `diagno-db` container is running and healthy before starting `diagno-api` |
| Slow performance | The NAS CPU should be Intel/AMD x64. ARM-based NAS (like some cheaper models) will be slower. |

## Network Access

By default the app is available on your local network only. To access from outside:

1. **VPN** (recommended): Set up Synology VPN Server, connect from outside
2. **Reverse proxy**: Control Panel → Login Portal → Advanced → Reverse Proxy → set up HTTPS with your domain
3. **QuickConnect**: Not recommended for medical data (slower, less control)

## Hardware Recommendations

| Users | RAM | Storage | NAS Model Example |
|-------|-----|---------|-------------------|
| 1-5 staff | 4 GB | 50 GB free | DS220+ |
| 5-15 staff | 8 GB | 100 GB free | DS420+ |
| 15+ staff | 16 GB | 200 GB free | DS920+ or DS1522+ |

## Security Notes

- Change the default `DB_PASSWORD` in `.env` before going live
- Keep DSM and Container Manager updated
- Use HTTPS if exposing to the internet (reverse proxy with Let's Encrypt)
- Regular backups are essential — patient data cannot be recreated
- Enable DSM firewall and restrict access to port 8888 to your clinic's IP range

## Support

If you need help:
1. Check the **Container Manager → Logs** for error messages
2. Take a screenshot of the error
3. Note your DSM version and NAS model
4. Contact your software support
