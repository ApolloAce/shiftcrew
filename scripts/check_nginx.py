import paramiko, sys
sys.stdout.reconfigure(line_buffering=True)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

cmds = [
    # Current nginx config
    'echo "=== NGINX SITES-ENABLED ===" && ls -la /etc/nginx/sites-enabled/',
    'echo "=== NGINX DEFAULT CONFIG ===" && cat /etc/nginx/sites-enabled/default 2>/dev/null || echo "No default"',
    'echo "=== NGINX SHIFTCREW CONFIG ===" && cat /etc/nginx/sites-enabled/shiftcrew 2>/dev/null || echo "No shiftcrew config"',
    'echo "=== ALL NGINX CONFIGS ===" && ls /etc/nginx/sites-available/',
    'echo "=== NGINX CONF.D ===" && ls /etc/nginx/conf.d/ 2>/dev/null || echo "Empty"',
    # Check SSL certs
    'echo "=== SSL CERTS ===" && ls /etc/letsencrypt/live/ 2>/dev/null || echo "No certs yet"',
    # Check what port Next.js is on
    'echo "=== NEXT PORT ===" && ss -tlnp | grep node',
    # Check next.config
    'echo "=== NEXT CONFIG ===" && cat /var/www/shiftcrew/next.config.mjs',
]

for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=15)
    out = o.read().decode('utf-8', errors='replace').strip()
    err = e.read().decode('utf-8', errors='replace').strip()
    if out:
        print(out)
    print()

c.close()
