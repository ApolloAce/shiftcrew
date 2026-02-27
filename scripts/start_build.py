import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e')

# Start build
i, o, e = ssh.exec_command("cd /var/www/shiftcrew && nohup npx next build > /tmp/nextbuild.log 2>&1 & echo $!", timeout=10)
pid = o.read().decode().strip()
print(f"Build started, PID: {pid}")

ssh.close()
