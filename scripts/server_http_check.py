import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

commands = [
    "pm2 status",
    "ss -ltnp | grep 3000 || true",
    "curl -I -sS http://localhost:3000 || true",
    "curl -I -sS http://127.0.0.1:3000 || true",
    "curl -I -sS https://shiftcrew.me || true",
]

for cmd in commands:
    print(f"\n=== {cmd} ===")
    i, o, e = ssh.exec_command(cmd, timeout=60)
    print(o.read().decode(errors='ignore'))
    err = e.read().decode(errors='ignore')
    if err.strip():
        print('ERR:', err)

ssh.close()
