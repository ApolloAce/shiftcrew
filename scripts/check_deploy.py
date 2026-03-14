import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e')

cmds = [
    "grep -n 'shiftTimes' /var/www/shiftcrew/app/employee/page.tsx",
    "grep -n '14:00' /var/www/shiftcrew/app/employee/page.tsx",
    "sed -n '93,106p' /var/www/shiftcrew/app/employee/page.tsx",
    # Check build status
    "pgrep -f 'next build' || echo 'BUILD_DONE'",
    "tail -10 /tmp/nextbuild.log 2>/dev/null",
]
for cmd in cmds:
    print(f"\n$ {cmd}")
    i,o,e = ssh.exec_command(cmd, timeout=15)
    print(o.read().decode())
ssh.close()
