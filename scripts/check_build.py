import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("104.248.217.57", username="root", password="@Emorej02e", timeout=30)

# Check build log for completion
i, o, e = ssh.exec_command("grep -E 'Compiled|error|Error' /tmp/nextbuild.log | tail -10", timeout=15)
print("Build log:", o.read().decode())

# Check running next processes
i, o, e = ssh.exec_command("ps aux | grep 'next build' | grep -v grep", timeout=10)
build_procs = o.read().decode().strip()
print("Build procs:", build_procs if build_procs else "NONE")

# Kill any stale build processes
if build_procs:
    i, o, e = ssh.exec_command("pkill -f 'next build'", timeout=10)
    print("Killed stale build processes")

# Restart PM2
i, o, e = ssh.exec_command("cd /var/www/shiftcrew && pm2 restart shiftcrew 2>&1", timeout=30)
print("PM2:", o.read().decode())

# Check PM2 status
i, o, e = ssh.exec_command("pm2 status 2>&1", timeout=10)
print(o.read().decode())

ssh.close()
print("Done!")
