import paramiko, sys, time
sys.stdout.reconfigure(line_buffering=True)

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"
DIR = "/var/www/shiftcrew"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...")
ssh.connect(HOST, username=USER, password=PASS, timeout=30)
print("Connected")

# Kill any existing build
ssh.exec_command("pkill -f 'next build' 2>/dev/null")
time.sleep(2)

# Start fresh build (fire and forget - don't read stdout)
transport = ssh.get_transport()
channel = transport.open_session()
channel.exec_command(f"cd {DIR} && nohup npx next build > /tmp/nextbuild.log 2>&1 &")
time.sleep(2)
channel.close()
print("Build started. Waiting 120s...")

# Wait for build
for i in range(24):
    time.sleep(5)
    print(f"  {(i+1)*5}s elapsed...")
    try:
        stdin, stdout, stderr = ssh.exec_command("tail -3 /tmp/nextbuild.log", timeout=10)
        tail = stdout.read().decode(errors="replace").strip()
        if "server-rendered on demand" in tail:
            print("Build completed!")
            break
    except:
        pass

# Check for errors and restart
stdin, stdout, stderr = ssh.exec_command("tail -10 /tmp/nextbuild.log", timeout=10)
log = stdout.read().decode(errors="replace")
print("Build log tail:")
print(log)

stdin, stdout, stderr = ssh.exec_command("grep -ci error /tmp/nextbuild.log", timeout=10)
error_count = stdout.read().decode().strip()
print(f"Error mentions: {error_count}")

if "server-rendered on demand" in log:
    print("Restarting PM2...")
    stdin, stdout, stderr = ssh.exec_command(f"cd {DIR} && pm2 restart shiftcrew 2>&1", timeout=30)
    print(stdout.read().decode(errors="replace"))
    print("DEPLOYED SUCCESSFULLY!")
else:
    print("Build may not have finished. Check manually.")

ssh.close()
