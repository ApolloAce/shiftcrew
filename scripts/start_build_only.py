import paramiko, sys
sys.stdout.reconfigure(line_buffering=True)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...")
ssh.connect("104.248.217.57", username="root", password="@Emorej02e", timeout=30)
print("Connected")

# Kill any existing build
ssh.exec_command("pkill -f 'next build' 2>/dev/null", timeout=10)

import time
time.sleep(1)

# Start fresh build
stdin, stdout, stderr = ssh.exec_command(
    "cd /var/www/shiftcrew && nohup npx next build > /tmp/nextbuild.log 2>&1 & echo $!",
    timeout=30
)
pid = stdout.read().decode().strip()
print(f"Build PID: {pid}")

ssh.close()
print("Done. Run: python scripts/deploy_v3.py check")
