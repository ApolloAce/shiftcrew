import paramiko
import sys
sys.stdout.reconfigure(line_buffering=True)
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('104.248.217.57', username='root', password='@Emorej02e')

# Check if build is running and PM2 status
cmds = [
    "ps aux | grep 'next build' | grep -v grep | head -3",
    "ls -la /var/www/shiftcrew/.next/BUILD_ID 2>&1",
    "pm2 status",
    "ls -la /var/www/shiftcrew/app/api/employees/password/route.ts 2>&1",
]
for cmd in cmds:
    print(f"\n--- {cmd} ---")
    i, o, e = c.exec_command(cmd)
    print(o.read().decode().strip())

c.close()
