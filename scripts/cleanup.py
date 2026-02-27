import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=15)
ssh.exec_command('pkill -f "next build"', timeout=5)
print("killed stale builds")
i,o,e = ssh.exec_command('pm2 list 2>&1 | head -10', timeout=10)
print(o.read().decode())
ssh.close()
