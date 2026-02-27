import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=15)

cmds = [
    "pgrep -f 'next build' || echo 'NO_BUILD_RUNNING'",
    "tail -15 /tmp/nb.log 2>/dev/null",
    "tail -15 /tmp/nb2.log 2>/dev/null",
    "ls -la /var/www/shiftcrew/.next/BUILD_ID",
    "pm2 list 2>&1 | head -10",
]
for cmd in cmds:
    print(f"\n$ {cmd}")
    i,o,e = ssh.exec_command(cmd, timeout=10)
    out = o.read().decode()
    if out: print(out)

ssh.close()
