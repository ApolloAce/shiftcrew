import paramiko, sys, time
sys.stdout.reconfigure(line_buffering=True)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=30)

# Quick DNS check from server
print("DNS check from server...")
_, o, _ = c.exec_command('host shiftcrew.me 2>&1', timeout=10)
print(o.read().decode().strip())

print("\nRunning certbot...")
_, o, e = c.exec_command(
    'certbot --nginx -d shiftcrew.me -d www.shiftcrew.me '
    '--non-interactive --agree-tos --email admin@shiftcrew.me --redirect 2>&1',
    timeout=120
)

while not o.channel.exit_status_ready():
    time.sleep(3)
    print("  working...")

output = o.read().decode('utf-8', errors='replace')
exit_code = o.channel.recv_exit_status()
print(output)
print(f"Exit code: {exit_code}")

if exit_code != 0 and ('DNS' in output or 'unauthorized' in output.lower()):
    print("\nRetrying with just shiftcrew.me...")
    _, o, e = c.exec_command(
        'certbot --nginx -d shiftcrew.me '
        '--non-interactive --agree-tos --email admin@shiftcrew.me --redirect 2>&1',
        timeout=120
    )
    while not o.channel.exit_status_ready():
        time.sleep(3)
        print("  working...")
    output = o.read().decode('utf-8', errors='replace')
    exit_code = o.channel.recv_exit_status()
    print(output)
    print(f"Exit code: {exit_code}")

if exit_code == 0:
    print("\n=== SSL INSTALLED! ===")
    # Show final config
    _, o, _ = c.exec_command('cat /etc/nginx/sites-available/shiftcrew', timeout=10)
    print(o.read().decode())
    
    # Test HTTPS from server
    _, o, _ = c.exec_command('curl -sI https://shiftcrew.me/ 2>&1 | head -5', timeout=15)
    print("HTTPS test:", o.read().decode().strip())

c.close()
