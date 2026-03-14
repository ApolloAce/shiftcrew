import paramiko, sys
sys.stdout.reconfigure(line_buffering=True)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...")
ssh.connect("104.248.217.57", username="root", password="@Emorej02e", timeout=30)
print("Connected")

# Check build log
stdin, stdout, stderr = ssh.exec_command("tail -10 /tmp/nextbuild.log", timeout=10)
log = stdout.read().decode(errors="replace")
print("Build log tail:")
print(log)

# Check for errors
stdin, stdout, stderr = ssh.exec_command("grep -ci error /tmp/nextbuild.log", timeout=10)
error_count = stdout.read().decode().strip()
print(f"Error mentions: {error_count}")

if "server-rendered on demand" in log:
    print("Build completed! Restarting PM2...")
    stdin, stdout, stderr = ssh.exec_command("cd /var/www/shiftcrew && pm2 restart shiftcrew 2>&1", timeout=30)
    print(stdout.read().decode(errors="replace"))
    print("DEPLOYED SUCCESSFULLY!")
else:
    print("Build may still be running. Check again later.")

ssh.close()
