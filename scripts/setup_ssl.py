import paramiko, sys, time
sys.stdout.reconfigure(line_buffering=True)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

# Check DNS first
print("Checking DNS for shiftcrew.me...")
_, o, _ = c.exec_command('dig +short shiftcrew.me A 2>/dev/null', timeout=10)
dns = o.read().decode().strip()
print(f"  DNS A record: {dns or 'NOT RESOLVED'}")

if not dns:
    print("\nDNS not propagated yet. Certbot needs DNS to work.")
    print("Trying www.shiftcrew.me...")
    _, o, _ = c.exec_command('dig +short www.shiftcrew.me A 2>/dev/null', timeout=10)
    dns_www = o.read().decode().strip()
    print(f"  www DNS: {dns_www or 'NOT RESOLVED'}")
    
    if not dns_www:
        print("\nWaiting for DNS propagation... Try again in a few minutes.")
        print("Re-run: python scripts/setup_ssl.py")
        c.close()
        sys.exit(1)

# Get SSL cert with certbot
print("\nRunning certbot for shiftcrew.me + www.shiftcrew.me...")
_, o, e = c.exec_command(
    'certbot --nginx -d shiftcrew.me -d www.shiftcrew.me --non-interactive --agree-tos --email admin@shiftcrew.me --redirect 2>&1',
    timeout=120
)

# Wait for completion
while not o.channel.exit_status_ready():
    time.sleep(2)
    
output = o.read().decode('utf-8', errors='replace')
exit_code = o.channel.recv_exit_status()

print(output)

if exit_code == 0:
    print("\nSSL CERTIFICATE INSTALLED SUCCESSFULLY!")
    
    # Show final nginx config
    print("\n=== FINAL NGINX CONFIG ===")
    _, o, _ = c.exec_command('cat /etc/nginx/sites-available/shiftcrew', timeout=10)
    print(o.read().decode())
    
    # Test HTTPS
    print("Testing HTTPS...")
    _, o, _ = c.exec_command('curl -s -o /dev/null -w "%{http_code}" https://shiftcrew.me/ 2>&1', timeout=15)
    status = o.read().decode().strip()
    print(f"  https://shiftcrew.me returns HTTP {status}")
    
    # Test HTTP redirect
    _, o, _ = c.exec_command('curl -s -o /dev/null -w "%{http_code}" -L http://shiftcrew.me/ 2>&1', timeout=15)
    status = o.read().decode().strip()
    print(f"  http://shiftcrew.me (follow redirect) returns HTTP {status}")
else:
    print(f"\nCERTBOT FAILED (exit code {exit_code})")
    print("Check output above for errors.")
    
    # If it failed because of DNS, try just the main domain
    if 'DNS problem' in output or 'not authorized' in output:
        print("\nTrying with just shiftcrew.me (without www)...")
        _, o, e = c.exec_command(
            'certbot --nginx -d shiftcrew.me --non-interactive --agree-tos --email admin@shiftcrew.me --redirect 2>&1',
            timeout=120
        )
        while not o.channel.exit_status_ready():
            time.sleep(2)
        print(o.read().decode('utf-8', errors='replace'))

c.close()
