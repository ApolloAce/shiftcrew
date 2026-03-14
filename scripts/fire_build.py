import paramiko, time
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=15)

# Don't read the nohup build output - just fire it
channel = ssh.get_transport().open_session()
channel.exec_command("cd /var/www/shiftcrew && npx next build > /tmp/nb2.log 2>&1 && pm2 restart shiftcrew >> /tmp/nb2.log 2>&1 && echo ALLDONE >> /tmp/nb2.log &")
time.sleep(2)
print("Build+restart fired in background. Wait ~2min then check /tmp/nb2.log")
ssh.close()
