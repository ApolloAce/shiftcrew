import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e')

cmds = [
    # Kill any lingering build processes
    "pkill -f 'next build' 2>/dev/null; sleep 1; echo 'killed'",
    # Check .next build was created
    "ls -la /var/www/shiftcrew/.next/BUILD_ID 2>/dev/null || echo 'no BUILD_ID'",
    "ls -lt /var/www/shiftcrew/.next/server/ | head -5",
    # Restart PM2
    "cd /var/www/shiftcrew && pm2 restart shiftcrew 2>&1",
]
for cmd in cmds:
    print(f"\n$ {cmd}")
    i,o,e = ssh.exec_command(cmd, timeout=30)
    print(o.read().decode())
    err = e.read().decode()
    if err: print("ERR:", err)
ssh.close()
print("Done!")
