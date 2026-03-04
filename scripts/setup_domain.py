import paramiko, sys, time
sys.stdout.reconfigure(line_buffering=True)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

# ── Step 1: Write new Nginx config for shiftcrew.me ──
NGINX_CONFIG = r"""server {
    listen 80;
    server_name shiftcrew.me www.shiftcrew.me 104.248.217.57;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
"""

print("Step 1: Writing Nginx config for shiftcrew.me...")
# Write config file
_, o, e = c.exec_command(f'cat > /etc/nginx/sites-available/shiftcrew << \'NGINX_EOF\'\n{NGINX_CONFIG}\nNGINX_EOF', timeout=10)
err = e.read().decode().strip()
if err:
    print(f"  ERROR writing config: {err}")
else:
    print("  Config written!")

# Verify symlink exists
_, o, _ = c.exec_command('ls -la /etc/nginx/sites-enabled/shiftcrew', timeout=5)
print(f"  Symlink: {o.read().decode().strip()}")

# ── Step 2: Test nginx config ──
print("\nStep 2: Testing Nginx config...")
_, o, e = c.exec_command('nginx -t 2>&1', timeout=10)
result = o.read().decode().strip()
err = e.read().decode().strip()
test_output = result or err
print(f"  {test_output}")

if 'successful' in test_output.lower() or 'ok' in test_output.lower():
    # ── Step 3: Reload nginx ──
    print("\nStep 3: Reloading Nginx...")
    _, o, e = c.exec_command('systemctl reload nginx 2>&1', timeout=10)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    print(f"  {out or err or 'Reloaded OK!'}")
else:
    print("\n  NGINX CONFIG TEST FAILED! Not reloading.")

# ── Step 4: Verify it's serving ──
print("\nStep 4: Testing proxy via localhost...")
_, o, _ = c.exec_command('curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>&1', timeout=10)
status = o.read().decode().strip()
print(f"  localhost:3000 returns HTTP {status}")

_, o, _ = c.exec_command('curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>&1', timeout=10)
status = o.read().decode().strip()
print(f"  localhost (via Nginx) returns HTTP {status}")

# ── Step 5: Show current config ──
print("\nStep 5: Final config:")
_, o, _ = c.exec_command('cat /etc/nginx/sites-available/shiftcrew', timeout=10)
print(o.read().decode())

# ── Step 6: Check DNS ──
print("Step 6: Checking DNS for shiftcrew.me...")
_, o, _ = c.exec_command('dig +short shiftcrew.me A 2>/dev/null || host shiftcrew.me 2>/dev/null || echo "DNS not resolved yet"', timeout=10)
dns = o.read().decode().strip()
print(f"  DNS result: {dns or 'No result (not propagated yet)'}")

c.close()
print("\nDone! Once DNS propagates, run: python scripts/setup_ssl.py")
