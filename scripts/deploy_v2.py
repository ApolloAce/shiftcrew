import paramiko, tarfile, os, io, time

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"
REMOTE_DIR = "/var/www/shiftcrew"

files = [
    "app/employee/schedule/page.tsx",
    "app/employee/page.tsx",
    "app/dashboard/scheduling/page.tsx",
    "app/api/schedules/route.ts",
]

# Create tar in memory
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode="w:gz") as tar:
    base = r"c:\client\shiftcrew"
    for f in files:
        full = os.path.join(base, f.replace("/", os.sep))
        tar.add(full, arcname=f)
buf.seek(0)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

# Step 1: Upload
sftp = ssh.open_sftp()
remote_tar = f"{REMOTE_DIR}/deploy_fix.tar.gz"
sftp.putfo(buf, remote_tar)
sftp.close()
print("[1/4] Uploaded tar")

# Step 2: Extract
stdin, stdout, stderr = ssh.exec_command(f"cd {REMOTE_DIR} && tar xzf deploy_fix.tar.gz && rm deploy_fix.tar.gz && echo 'EXTRACT_OK'", timeout=30)
print("[2/4] Extract:", stdout.read().decode().strip())

# Step 3: Build - use a long timeout and read in chunks
print("[3/4] Building (this takes ~2min)...")
transport = ssh.get_transport()
transport.set_keepalive(30)
channel = transport.open_session()
channel.settimeout(600)
channel.exec_command(f"cd {REMOTE_DIR} && npx next build 2>&1 | tail -20")

output = b""
while True:
    if channel.recv_ready():
        chunk = channel.recv(4096)
        if not chunk:
            break
        output += chunk
    elif channel.exit_status_ready():
        # Read any remaining
        while channel.recv_ready():
            output += channel.recv(4096)
        break
    else:
        time.sleep(2)

print("[3/4] Build output:")
print(output.decode())
print("[3/4] Build exit code:", channel.recv_exit_status())

# Step 4: PM2 restart
stdin, stdout, stderr = ssh.exec_command(f"cd {REMOTE_DIR} && pm2 restart shiftcrew 2>&1", timeout=30)
out = stdout.read().decode()
print("[4/4] PM2 restart:", out)

ssh.close()
print("\nDone!")
