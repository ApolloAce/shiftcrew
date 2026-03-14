import paramiko
import sys
sys.stdout.reconfigure(line_buffering=True)
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('104.248.217.57', username='root', password='@Emorej02e')

cmds = [
    "cd /var/www/shiftcrew && pm2 stop shiftcrew",
    "cd /var/www/shiftcrew && rm -rf .next",
    "cd /var/www/shiftcrew && npm run build",
    "cd /var/www/shiftcrew && pm2 restart shiftcrew --update-env",
    "pm2 status",
    "curl -I -s http://127.0.0.1:3000 | head -5",
]
for cmd in cmds:
    print(f"\n--- {cmd} ---")
    i, o, e = c.exec_command(cmd)
    print(o.read().decode().strip())
    err = e.read().decode().strip()
    if err:
        print(err)

c.close()
