import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

commands = [
    "pm2 status",
    "pm2 logs shiftcrew --lines 40 --nostream",
    "curl -I -sS http://127.0.0.1:3000 || true",
    "curl -I -sS https://shiftcrew.me || true",
    "systemctl is-active nginx",
]

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

for cmd in commands:
    print(f"\n=== {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=60)
    out = stdout.read().decode(errors="ignore")
    err = stderr.read().decode(errors="ignore")
    if out.strip():
        print(out)
    if err.strip():
        print("ERR:", err)

ssh.close()
