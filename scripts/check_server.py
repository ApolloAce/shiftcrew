import paramiko, sys
sys.stdout.reconfigure(line_buffering=True)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

cmds = [
    # Check what's listening on port 80/443
    'echo "=== PORTS 80/443 ===" && ss -tlnp | grep -E ":80|:443" || echo "Nothing on 80/443"',
    # Check nginx status
    'echo "=== NGINX ===" && which nginx 2>/dev/null && nginx -v 2>&1 || echo "Nginx not installed"',
    # Check what PM2 is serving
    'echo "=== PM2 ===" && pm2 list',
    # Check if certbot exists
    'echo "=== CERTBOT ===" && which certbot 2>/dev/null || echo "Certbot not installed"',
    # Check Node app port
    'echo "=== NODE PORT ===" && grep -r "PORT" /var/www/shiftcrew/.env 2>/dev/null || echo "No .env found"',
    'echo "=== ENV ===" && cat /var/www/shiftcrew/.env 2>/dev/null || echo "No .env"',
    # Check current hostname/domain config
    'echo "=== HOSTNAME ===" && hostname && echo "=== /etc/hosts ===" && cat /etc/hosts',
    # Check firewall
    'echo "=== UFW ===" && ufw status 2>/dev/null || echo "UFW not available"',
    # Check OS
    'echo "=== OS ===" && cat /etc/os-release | head -5',
]

for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=15)
    out = o.read().decode('utf-8', errors='replace').strip()
    err = e.read().decode('utf-8', errors='replace').strip()
    if out:
        print(out)
    if err and 'not found' not in err.lower():
        print(f"  STDERR: {err}")
    print()

c.close()
