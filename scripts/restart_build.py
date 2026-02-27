import paramiko, time

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"
REMOTE_DIR = "/var/www/shiftcrew"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

# Kill all existing next build processes
print("Killing existing build processes...")
stdin, stdout, stderr = ssh.exec_command('pkill -f "next build" 2>/dev/null; echo KILLED', timeout=15)
print(stdout.read().decode().strip())

time.sleep(3)

# Start a fresh build
print("Starting fresh build...")
stdin, stdout, stderr = ssh.exec_command(
    f"cd {REMOTE_DIR} && nohup npx next build > /tmp/nextbuild.log 2>&1 & echo $!",
    timeout=10
)
pid = stdout.read().decode().strip()
print(f"Build started, PID: {pid}")

ssh.close()
