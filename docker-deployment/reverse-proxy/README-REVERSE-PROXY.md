# Care Diagnostics ERP — Optional Nginx Reverse Proxy

## Do You Need This?

**Probably not yet.** The ERP works perfectly on `http://localhost:8081/` without any reverse proxy.

### When You DON'T Need Nginx
- Running inside a doctor's office on a local PC or NAS
- Only staff inside the clinic access the ERP
- No custom domain name
- No need for HTTPS on the LAN

### When You DO Need Nginx
- You want a custom domain like `erp.hopehospital.in`
- You need HTTPS for patient-facing website over the internet
- You want to add PACS/DICOM routing through the same entry point
- You need load balancing across multiple backend servers
- You want Web Application Firewall (WAF) or advanced security headers

## Quick Start (Local Testing Only)

```cmd
cd docker-deployment/reverse-proxy
docker compose -f docker-compose.nginx.yml up -d
```

Now access the ERP at `http://localhost/` instead of `http://localhost:8081/`.

To stop:
```cmd
docker compose -f docker-compose.nginx.yml down
```

## Architecture

```
Internet / LAN
      |
      v
   ┌────────────┐
   │  Nginx     │   (port 80 / 443)
   │  Reverse    │   • domain routing
   │   Proxy     │   • SSL termination
   │             │   • security headers
   └────────────┘
      |
      v
   Backend:8080 (API + website + ERP + admin)
      |
      v
   PostgreSQL (internal)
```

## Files

| File | Purpose |
|------|---------|
| `docker-compose.nginx.yml` | Nginx container definition (separate from main compose) |
| `nginx.conf` | HTTP-only reverse proxy config |
| `nginx-ssl-template.conf` | HTTPS template for custom domains |
| `start-nginx.bat` | One-click start (Windows) |
| `stop-nginx.bat` | One-click stop (Windows) |

## How to Add a Domain Later

### Step 1: Buy/Get a Domain
- Register a domain (e.g. from GoDaddy, Namecheap, Cloudflare)
- Example: `hopehospital.in`

### Step 2: Set DNS A-Record
- Point `erp.hopehospital.in` to your server's public IP address
- Also create:
  - `www.hopehospital.in` → same IP (for public website)
  - `pacs.hopehospital.in` → same IP (future DICOM PACS)
  - `reports.hopehospital.in` → same IP (future reports portal)

### Step 3: Get SSL Certificates (Let's Encrypt — FREE)

On your server (NOT inside Docker):
```bash
# Install certbot
sudo apt install certbot   # Ubuntu/Debian

# Get certificate
sudo certbot certonly --standalone -d erp.hopehospital.in -d www.hopehospital.in

# Certificates saved to:
#   /etc/letsencrypt/live/erp.hopehospital.in/fullchain.pem
#   /etc/letsencrypt/live/erp.hopehospital.in/privkey.pem
```

### Step 4: Configure Nginx
1. Copy `nginx-ssl-template.conf` to `nginx.conf`
2. Replace `erp.hopehospital.in` with your actual domain
3. Uncomment SSL lines in `docker-compose.nginx.yml`:
   ```yaml
   ports:
     - "80:80"
     - "443:443"
   volumes:
     - ./nginx.conf:/etc/nginx/nginx.conf:ro
     - /etc/letsencrypt/live/erp.hopehospital.in:/etc/nginx/certs:ro
   ```
4. Restart: `docker compose -f docker-compose.nginx.yml up -d`

### Step 5: Auto-Renewal
```bash
# Test renewal
certbot renew --dry-run

# Add to crontab (runs every 12 hours)
echo "0 0,12 * * * certbot renew --quiet" | sudo crontab -
```

## Alternative: Cloudflare Tunnel (RECOMMENDED for Clinics)

For most clinics, **Cloudflare Tunnel is safer and simpler** than exposing your server directly:

1. **No open ports** — no firewall rules needed
2. **DDoS protection** built-in
3. **Free SSL** — no certificate management
4. **No public IP exposure**

### Setup:
1. Create a Cloudflare account (free)
2. Add your domain to Cloudflare
3. Install `cloudflared` tunnel on your server:
   ```bash
   cloudflared tunnel create my-clinic-erp
   cloudflared tunnel route dns my-clinic-erp erp.hopehospital.in
   cloudflared tunnel run my-clinic-erp --url http://localhost:8081
   ```
4. No nginx needed at all — Cloudflare handles everything

### Why This is Better:
- Your server stays completely hidden from the internet
- No port forwarding on your router
- No certificate management
- Automatic DDoS protection
- Works even with dynamic IP addresses

## How to Add PACS/DICOM Routing Later

When you add an Orthanc or Conquest PACS server as another Docker container:

1. Add the PACS service to `docker-compose.yml`
2. Uncomment the `/pacs/` block in `nginx.conf`
3. Staff access DICOM viewer at `http://erp.hopehospital.in/pacs/`

## Security Notes

- **Never expose PostgreSQL port 5432** to the internet
- **Always use HTTPS** for patient data over the internet
- **Restrict admin access** by IP if possible
- **Enable 2FA** on your domain registrar and Cloudflare accounts
- **Keep nginx updated**: `docker compose -f docker-compose.nginx.yml pull nginx`

## When Not to Use Nginx

If you are using **Cloudflare Tunnel**, **Traefik**, or another reverse proxy, you do NOT need nginx at all. This folder is provided as one option — use whichever you prefer.
