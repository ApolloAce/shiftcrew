import paramiko, tarfile, os, io

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"
REMOTE_DIR = "/root/shiftcrew"

files = [
    "app/employee/schedule/page.tsx",
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
ssh.connect(HOST, username=USER, password=PASS)

sftp = ssh.open_sftp()
# Ensure remote directory exists
try:
    sftp.stat(REMOTE_DIR)
except FileNotFoundError:
    sftp.mkdir(REMOTE_DIR)
remote_tar = f"{REMOTE_DIR}/schedule_fix.tar.gz"
sftp.putfo(buf, remote_tar)
sftp.close()

commands = [
    f"cd {REMOTE_DIR} && tar xzf schedule_fix.tar.gz && rm schedule_fix.tar.gz",
    f"cd {REMOTE_DIR} && npx next build 2>&1 | tail -5",
    f"cd {REMOTE_DIR} && pm2 restart shiftcrew 2>&1",
]

for cmd in commands:
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=180)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out)
    if err: print(err)

ssh.close()
print("\nDone!")
